import { EvidenceError } from "./checker-rpc.ts";

export interface TokenMovement {
  readonly from: string;
  readonly to: string;
  readonly amount: bigint;
  readonly transactionIndex: number;
}

export function requireMovement(
  actual: readonly TokenMovement[],
  expected: Omit<TokenMovement, "transactionIndex"> | null,
): void {
  if (expected === null) {
    if (actual.length !== 0) throw new EvidenceError("Unexpected token movement in transaction");
  } else if (
    actual.length !== 1 ||
    actual[0]?.from !== expected.from ||
    actual[0].to !== expected.to ||
    actual[0].amount !== expected.amount
  ) {
    throw new EvidenceError("Actual transfer differs from required recipient or amount");
  }
}

export function reconstructBalance(
  address: string,
  beforeBlock: bigint,
  afterBlock: bigint,
  changes: readonly TokenMovement[],
  transactionIndex: number,
) {
  const effect = (change: TokenMovement) =>
    (change.to === address ? change.amount : 0n) - (change.from === address ? change.amount : 0n);
  const blockDelta = changes.reduce((sum, change) => sum + effect(change), 0n);
  if (beforeBlock + blockDelta !== afterBlock)
    throw new EvidenceError("Token logs do not reconcile actual block-boundary balances");
  const beforeTransaction =
    beforeBlock +
    changes
      .filter((change) => change.transactionIndex < transactionIndex)
      .reduce((sum, change) => sum + effect(change), 0n);
  const afterTransaction =
    beforeTransaction +
    changes
      .filter((change) => change.transactionIndex === transactionIndex)
      .reduce((sum, change) => sum + effect(change), 0n);
  if (beforeTransaction < 0n || afterTransaction < 0n)
    throw new EvidenceError("Reconstructed token balance is negative");
  return { beforeTransaction, afterTransaction, blockDelta };
}
