import type { TransactionResponse } from "ethers";
import type { CampaignManifest, DeploymentRole, TransactionEvidence } from "./manifest-types.ts";
import { EvidenceError, integer, tuple } from "./checker-rpc.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { referenceIdentity, referenceTerms } from "./index.ts";

export function checkTransactionAction(
  item: TransactionEvidence,
  transaction: Pick<TransactionResponse, "to" | "from" | "data" | "value">,
  manifest: CampaignManifest,
): void {
  const methods: Readonly<Record<string, readonly [DeploymentRole, string]>> = {
    "approve-source": ["sourceToken", "approve"],
    "supply-buyer": ["settlementToken", "transfer"],
    "approve-settlement": ["settlementToken", "approve"],
    "withdraw-fee": ["market", "withdraw"],
    create: ["vault", "createClaim"],
    reserve: ["vault", "reserveSale"],
    assign: ["vault", "assignSale"],
    cancel: ["vault", "cancelExpiredSale"],
    redeem: ["vault", "redeem"],
    fund: ["market", "fundReservation"],
    settle: ["market", "settleAssignment"],
    refund: ["market", "recognizeCancellation"],
    withdraw: ["market", "withdraw"],
  };
  const operation = item.action.startsWith(`${manifest.campaignId}-`)
    ? item.action.slice(manifest.campaignId.length + 1)
    : item.action;
  const expected = methods[operation];
  if (!expected) throw new EvidenceError("Unrecognized campaign transaction action");
  const [role, method] = expected;
  const pin = applicationPins[role];
  if (transaction.to !== pin.address || item.chainId !== pin.chainId || transaction.value !== 0n)
    throw new EvidenceError("Transaction action points to wrong target/chain/value");
  const parsed = applicationInterfaces[role].parseTransaction({ data: transaction.data });
  if (parsed?.name !== method)
    throw new EvidenceError("Transaction action label differs from actual calldata");
  const terms = manifest.terms;
  if (operation === "approve-source" || operation === "approve-settlement") {
    const sourceApproval = operation === "approve-source";
    if (
      transaction.from !== (sourceApproval ? terms.feeRecipient : terms.buyer) ||
      parsed.args[0] !== (sourceApproval ? terms.sourceVault : terms.destinationMarket)
    )
      throw new EvidenceError("Approval has wrong actor or spender");
  }
  if (operation === "create") {
    if (
      parsed.args[0] !== terms.sourceToken ||
      integer(parsed.args[1]).toString() !== terms.sourceFaceValueRaw ||
      parsed.args[2] !== terms.seller ||
      integer(parsed.args[3]).toString() !== terms.maturity ||
      transaction.from !== terms.feeRecipient
    )
      throw new EvidenceError("Source funding calldata differs from canonical claim");
  }
  if (
    ["reserve", "assign", "cancel", "redeem"].includes(operation) &&
    integer(parsed.args[0]).toString() !== terms.claimId
  )
    throw new EvidenceError("Source transaction claim mismatch");
  if (
    ["assign", "cancel"].includes(operation) &&
    integer(parsed.args[1]).toString() !== terms.round
  )
    throw new EvidenceError("Source transaction round mismatch");
  if (
    operation === "assign" &&
    (parsed.args[2] !== manifest.identity.termsHash || transaction.from !== terms.seller)
  )
    throw new EvidenceError("Source assignment hash or signer mismatch");
  if (operation === "reserve" || operation === "fund") {
    const encodedTerms = referenceIdentity(
      referenceTerms(tuple(parsed.args[operation === "reserve" ? 1 : 2])),
    ).encodedTerms;
    if (
      encodedTerms !== manifest.identity.encodedTerms ||
      transaction.from !== (operation === "reserve" ? terms.seller : terms.buyer)
    )
      throw new EvidenceError("Reserved/funded terms or actor mismatch");
  }
  if (["settle", "refund"].includes(operation) && parsed.args[2] !== manifest.identity.saleId)
    throw new EvidenceError("Destination outcome sale mismatch");
  if (operation === "withdraw" || operation === "withdraw-fee") {
    const recipient =
      operation === "withdraw-fee"
        ? terms.feeRecipient
        : manifest.campaignId === "a"
          ? terms.seller
          : terms.buyer;
    if (transaction.from !== recipient)
      throw new EvidenceError("Withdrawal is attributed to wrong recipient");
  }
}
