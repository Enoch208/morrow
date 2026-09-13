import { ConfigurationError } from "./environment.ts";

export function checkCustodyBudget(
  records: readonly Record<string, unknown>[],
  action: string,
  chainId: bigint,
  cost: bigint,
): void {
  const valid =
    chainId === 11155111n
      ? ["source-token", "vault"]
      : chainId === 102031n
        ? ["settlement-token", "market"]
        : [];
  if (!valid.includes(action))
    throw new ConfigurationError("Action outside approved custody deployment scope");
  const cap = chainId === 11155111n ? 20000000000000000n : 50000000000000000n;
  const commitments = new Map<string, bigint>();
  for (const record of records) {
    if (record.state !== "prepared" && record.state !== "submitted") continue;
    if (record.action === action)
      throw new ConfigurationError(
        "Deployment already prepared or submitted; reconcile before retry",
      );
    if (record.chainId !== chainId.toString()) continue;
    if (
      typeof record.action !== "string" ||
      typeof record.costCeiling !== "string" ||
      !/^\d+$/.test(record.costCeiling)
    ) {
      throw new ConfigurationError("Invalid custody gas commitment");
    }
    commitments.set(record.action, BigInt(record.costCeiling));
  }
  const committed = [...commitments.values()].reduce((sum, value) => sum + value, 0n);
  if (cost <= 0n || cost + committed > cap)
    throw new ConfigurationError("Approved custody deployment gas cap exceeded");
}
