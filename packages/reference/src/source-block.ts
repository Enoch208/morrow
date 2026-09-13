import { EvidenceError } from "./checker-rpc.ts";

export interface SourceBlockChange {
  readonly claimId: bigint;
  readonly name: string;
  readonly face: bigint;
  readonly transactionIndex: number;
  readonly logIndex: number;
}

export interface SourceAccounting {
  readonly backing: bigint;
  readonly balance: bigint;
  readonly nextClaimId: bigint;
}

export function assertSourceBlock(
  changes: readonly SourceBlockChange[],
  before: SourceAccounting,
  after: SourceAccounting,
) {
  let backingDelta = 0n,
    nextClaimId = before.nextClaimId;
  for (const change of [...changes].sort(
    (a, b) => a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex,
  )) {
    if (change.name === "ClaimFunded") {
      if (change.face <= 0n || change.claimId !== nextClaimId)
        throw new EvidenceError("Source creation sequence or amount mismatch");
      backingDelta += change.face;
      nextClaimId++;
    } else if (change.name === "ClaimRedeemed") {
      if (change.face <= 0n) throw new EvidenceError("Invalid source redemption amount");
      backingDelta -= change.face;
    } else if (
      !["SaleReserved", "SaleAssigned", "SaleCancelled"].includes(change.name) ||
      change.face !== 0n
    )
      throw new EvidenceError("Unknown source accounting event");
  }
  if (
    after.nextClaimId !== nextClaimId ||
    after.backing !== before.backing + backingDelta ||
    before.backing < 0n ||
    after.backing < 0n ||
    before.nextClaimId < 1n ||
    before.balance < before.backing ||
    after.balance < after.backing
  )
    throw new EvidenceError("Source block accounting does not reconcile actual reads");
  return {
    backingDelta,
    createdClaims: nextClaimId - before.nextClaimId,
    attribution:
      "Global backing and claim counter reconcile every vault event in the block, not just the selected transaction",
  };
}
