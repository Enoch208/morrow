import { ConfigurationError } from "./environment.ts";

export function checkCampaignBudget(
  records: readonly Record<string, unknown>[],
  action: string,
  chainId: bigint,
  cost: bigint,
): void {
  if (chainId !== 11155111n && chainId !== 102031n)
    throw new ConfigurationError("Unsupported campaign chain");
  const cap = chainId === 11155111n ? 20000000000000000n : 50000000000000000n;
  const commitments = new Map<string, bigint>();
  for (const record of records) {
    if (record.state !== "prepared" && record.state !== "submitted") continue;
    if (record.action === action)
      throw new ConfigurationError(
        "Campaign action already prepared/submitted; reconcile before retry",
      );
    if (record.chainId !== chainId.toString()) continue;
    if (
      typeof record.action !== "string" ||
      typeof record.costCeiling !== "string" ||
      !/^\d+$/.test(record.costCeiling)
    )
      throw new ConfigurationError("Invalid campaign gas commitment");
    commitments.set(record.action, BigInt(record.costCeiling));
  }
  const spent = [...commitments.values()].reduce((sum, value) => sum + value, 0n);
  if (cost <= 0n || spent + cost > cap) throw new ConfigurationError("Campaign gas cap exceeded");
}
