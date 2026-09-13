import { ZeroHash } from "ethers";
import type { JsonRpcProvider, Log, TransactionReceipt } from "ethers";
import { EvidenceError, integer } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import { c5Actors, c5ReferenceTerms } from "./c5-policy.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import type { DeploymentRole } from "./manifest-types.ts";
import { referenceIdentity } from "./index.ts";
import { c5CanonicalBlock, c5CheckPins, c5Read } from "./c5-chain.ts";
import { requireMovement, reconstructBalance } from "./balance-history.ts";
import type { TokenMovement } from "./balance-history.ts";

export function c5CallPolicy(action: string, claimId: string) {
  const terms = c5ReferenceTerms(claimId, action.startsWith("c5-r1-") ? "1" : "2");
  let role: DeploymentRole = "vault",
    method: string,
    actor: string = c5Actors.seller;
  let args: readonly unknown[];
  if (/^c5-(approve|reset|revoke)-(source|settlement)$/.test(action)) {
    const source = action.endsWith("-source");
    role = source ? "sourceToken" : "settlementToken";
    actor = source ? c5Actors.payer : c5Actors.buyer;
    method = "approve";
    args = [
      source ? terms.sourceVault : terms.destinationMarket,
      action.startsWith("c5-approve-") ? (source ? "10000000" : "9410000") : "0",
    ];
  } else if (action === "c5-create") {
    actor = c5Actors.payer;
    method = "createClaim";
    args = [terms.sourceToken, "10000000", c5Actors.seller, "1789306200", ZeroHash];
  } else if (/^c5-r[12]-reserve$/.test(action)) {
    method = "reserveSale";
    args = [claimId, terms];
  } else if (/^c5-r[12]-cancel$/.test(action)) {
    method = "cancelExpiredSale";
    args = [claimId, terms.round];
  } else if (action === "c5-r2-assign") {
    method = "assignSale";
    args = [claimId, "2", referenceIdentity(terms).termsHash];
  } else if (action === "c5-redeem") {
    method = "redeem";
    args = [claimId];
    actor = "beneficiary";
  } else if (/^c5-withdraw-(seller|fee|buyer)$/.test(action)) {
    role = "market";
    method = "withdraw";
    args = [];
    actor = action.endsWith("-seller")
      ? c5Actors.seller
      : action.endsWith("-fee")
        ? c5Actors.payer
        : c5Actors.buyer;
  } else if (/^c5-r2-(fund|settle|refund)$/.test(action)) {
    role = "market";
    method = action.endsWith("-fund")
      ? "fundReservation"
      : action.endsWith("-settle")
        ? "settleAssignment"
        : "recognizeCancellation";
    actor = action.endsWith("-fund") ? c5Actors.buyer : c5Actors.payer;
    args = [];
  } else throw new EvidenceError("Unsupported C5 journal action");
  return { role, method, actor, args, terms };
}

export async function c5Transaction(
  rpc: JsonRpcProvider,
  action: string,
  hash: string,
  claimId: string,
) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new EvidenceError("Invalid C5 transaction hash");
  const [transaction, receipt] = await Promise.all([
    rpc.getTransaction(hash),
    rpc.getTransactionReceipt(hash),
  ]);
  if (
    !transaction ||
    receipt?.status !== 1 ||
    receipt.hash !== hash ||
    transaction.hash !== hash ||
    transaction.value !== 0n
  )
    throw new EvidenceError("C5 transaction lacks successful zero-value receipt");
  const policy = c5CallPolicy(action, claimId),
    pin = applicationPins[policy.role];
  if (
    transaction.to !== pin.address ||
    receipt.to !== pin.address ||
    transaction.from !== receipt.from ||
    transaction.chainId.toString() !== pin.chainId ||
    (policy.actor !== "beneficiary" && transaction.from !== policy.actor)
  )
    throw new EvidenceError("C5 transaction actor, deployment or chain mismatch");
  const block = await rpc.getBlock(receipt.blockNumber);
  if (
    !block?.hash ||
    block.hash !== receipt.blockHash ||
    block.transactions[receipt.index] !== hash
  )
    throw new EvidenceError("C5 receipt coordinates not canonical");
  await c5CheckPins(rpc, pin.chainId === "11155111" ? "source" : "destination", block.number);
  const abi = applicationInterfaces[policy.role];
  const call = abi.parseTransaction({ data: transaction.data });
  if (call?.name !== policy.method) throw new EvidenceError("C5 transaction method mismatch");
  const args = ["fundReservation", "settleAssignment", "recognizeCancellation"].includes(call.name)
    ? [
        call.args[0],
        call.args[1],
        call.name === "fundReservation" ? policy.terms : referenceIdentity(policy.terms).saleId,
      ]
    : policy.args;
  if (transaction.data !== abi.encodeFunctionData(policy.method, args))
    throw new EvidenceError("C5 actual calldata differs from independent fixed commitments");
  await c5CanonicalBlock(rpc, block.number, block.hash);
  return { transaction, receipt, call, policy, block };
}

function transfers(logs: readonly Log[], token: string): TokenMovement[] {
  return logs
    .filter(
      (log) =>
        log.address === token &&
        log.topics[0] === applicationInterfaces.sourceToken.getEvent("Transfer")?.topicHash,
    )
    .map((log) => {
      const parsed = applicationInterfaces.sourceToken.parseLog(log);
      if (!parsed || log.removed) throw new EvidenceError("C5 invalid token transfer log");
      return {
        from: string(parsed.args[0]),
        to: string(parsed.args[1]),
        amount: integer(parsed.args[2]),
        transactionIndex: log.transactionIndex,
      };
    });
}

export async function c5Payments(
  rpc: JsonRpcProvider,
  side: "source" | "destination",
  receipt: TransactionReceipt,
  expected: Omit<TokenMovement, "transactionIndex"> | null,
) {
  const role = side === "source" ? "sourceToken" : "settlementToken",
    token = applicationPins[role].address;
  requireMovement(transfers(receipt.logs, token), expected);
  const logs = await rpc.getLogs({ address: token, blockHash: receipt.blockHash });
  if (
    logs.some(
      (log) =>
        log.removed ||
        log.blockHash !== receipt.blockHash ||
        log.blockNumber !== receipt.blockNumber ||
        (log.transactionIndex === receipt.index) !== (log.transactionHash === receipt.hash),
    )
  )
    throw new EvidenceError("C5 token history coordinates mismatch");
  requireMovement(
    transfers(
      logs.filter((log) => log.transactionHash === receipt.hash),
      token,
    ),
    expected,
  );
  const changes = transfers(logs, token);
  const addresses = new Set([
    ...(expected ? [expected.from, expected.to] : []),
    ...changes.flatMap((change) => [change.from, change.to]),
  ]);
  addresses.delete("0x0000000000000000000000000000000000000000");
  const balances = await Promise.all(
    [...addresses].map(async (address) => {
      const [before, after] = await Promise.all([
        c5Read(rpc, role, "balanceOf", [address], receipt.blockNumber - 1),
        c5Read(rpc, role, "balanceOf", [address], receipt.blockNumber),
      ]);
      return {
        address,
        beforeRaw: before.raw,
        afterRaw: after.raw,
        ...reconstructBalance(
          address,
          integer(before.decoded[0]),
          integer(after.decoded[0]),
          changes,
          receipt.index,
        ),
      };
    }),
  );
  return { token, expected, changes, balances };
}
