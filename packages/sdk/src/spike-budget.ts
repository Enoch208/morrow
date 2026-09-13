import { ConfigurationError } from "./environment.ts";

export function checkSpikeSubmission(
  records: readonly Record<string, unknown>[],
  action: string,
  chainId: bigint,
  costCeiling: bigint,
): void {
  const budget =
    chainId === 11155111n
      ? 5_000_000_000_000_000n
      : chainId === 102031n
        ? 50_000_000_000_000_000n
        : null;
  if (budget === null) throw new ConfigurationError("Unsupported chain for Stage A");
  const commitments = new Map<string, bigint>();
  for (const record of records) {
    if (record.state !== "prepared" && record.state !== "submitted") continue;
    if (record.action === action)
      throw new ConfigurationError("Action already submitted or prepared; reconcile before retry");
    if (record.chainId !== chainId.toString()) continue;
    if (
      typeof record.action !== "string" ||
      typeof record.costCeiling !== "string" ||
      !/^\d+$/.test(record.costCeiling)
    )
      throw new ConfigurationError("Invalid prior gas commitment");
    commitments.set(record.action, BigInt(record.costCeiling));
  }
  const committed = [...commitments.values()].reduce((total, amount) => total + amount, 0n);
  if (costCeiling <= 0n || costCeiling + committed > budget)
    throw new ConfigurationError("Stage A gas budget exceeded");
}
