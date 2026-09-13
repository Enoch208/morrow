import { EvidenceError, pins } from "./checker-rpc.ts";

export const c5Actors = {
  payer: "0x9DDB9007583a7b9DF073B65bCE820f77D6E2365D",
  seller: "0xB9e1914C0844d9cd0188AdFFc10e3Bd6A633D12c",
  buyer: "0x8c48477bd205B0007d32A45ea3b7aE27745FDfbE",
} as const;

export function c5ReferenceTerms(claimId: string, round: string): Record<string, string> {
  if (!/^[1-9][0-9]*$/.test(claimId) || (round !== "1" && round !== "2"))
    throw new EvidenceError("Invalid C5 claim or round");
  return {
    protocolVersion: "1",
    sourceEvmChainId: "11155111",
    sourceVault: pins.vault,
    claimId,
    round,
    destinationEvmChainId: "102031",
    destinationMarket: pins.market,
    seller: c5Actors.seller,
    buyer: c5Actors.buyer,
    sourceToken: pins.sourceToken,
    sourceFaceValueRaw: "10000000",
    maturity: "1789306200",
    settlementToken: pins.token,
    grossPurchasePriceRaw: "9410000",
    feeBps: "50",
    feeRecipient: c5Actors.payer,
    fundBefore: round === "1" ? "1789293600" : "1789299900",
    assignBefore: round === "1" ? "1789295400" : "1789301700",
  };
}

const stages = [
  "c5-create",
  "c5-r1-reserve",
  "c5-r1-reserve-proof",
  "c5-r1-cancel",
  "c5-r1-cancel-proof",
  "c5-r2-reserve",
  "c5-r2-reserve-proof",
  "c5-r2-fund",
  "c5-r2-assign",
  "c5-r2-assign-proof",
  "c5-refusal",
  "c5-r2-settle",
  "c5-withdraw-seller",
  "c5-withdraw-fee",
  "c5-redeem",
] as const;

export function c5StageStatus(verified: ReadonlySet<string>, pendingCount = 0) {
  if (!Number.isSafeInteger(pendingCount) || pendingCount < 0)
    throw new EvidenceError("Invalid C5 pending count");
  const missing = stages.filter((stage) => !verified.has(stage));
  return {
    verified: [...verified],
    missing,
    c5Verified: missing.length === 0 && pendingCount === 0,
    fullReleaseVerified: false,
    evidenceKind: "historical-replay",
    status: missing.length === 0 && pendingCount === 0 ? "C5_VERIFIED" : "INCOMPLETE",
  };
}

export function c5JournalIntents(records: readonly Record<string, unknown>[]) {
  const intents = new Map<
    string,
    { action: string; transactionHash: string; chainId: string; sender: string }
  >();
  for (const entry of records) {
    if (!["prepared", "submitted", "mined", "reverted"].includes(String(entry.state))) continue;
    const { action, transactionHash, chainId, sender } = entry;
    if (
      typeof action !== "string" ||
      !action.startsWith("c5-") ||
      typeof transactionHash !== "string" ||
      !/^0x[0-9a-fA-F]{64}$/.test(transactionHash) ||
      (chainId !== "11155111" && chainId !== "102031") ||
      typeof sender !== "string" ||
      !Object.values(c5Actors).some((actor) => actor === sender)
    )
      throw new EvidenceError("C5 public intent has invalid actor, chain or hash");
    const previous = intents.get(action);
    if (
      previous &&
      (previous.transactionHash !== transactionHash ||
        previous.chainId !== chainId ||
        previous.sender !== sender)
    )
      throw new EvidenceError(
        "C5 action has conflicting transaction identities; reconciliation required",
      );
    intents.set(action, { action, transactionHash, chainId, sender });
  }
  return [...intents.values()];
}
