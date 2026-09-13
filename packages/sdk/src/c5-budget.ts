import { ConfigurationError } from "./errors.ts";
import { c5ActionPolicy } from "./c5-call-policy.ts";

export function checkC5Budget(
  records: readonly Record<string, unknown>[],
  action: string,
  chainId: bigint,
  cost: bigint,
): void {
  if (chainId !== 11155111n && chainId !== 102031n)
    throw new ConfigurationError("Unsupported C5 chain");
  const cap = chainId === 11155111n ? 10000000000000000n : 20000000000000000n;
  const commitments = new Map<string, bigint>();
  for (const record of records) {
    if (record.state !== "prepared" && record.state !== "submitted") continue;
    if (record.action === action)
      throw new ConfigurationError("C5 action already prepared; reconcile before retry");
    if (
      typeof record.action !== "string" ||
      typeof record.costCeiling !== "string" ||
      !/^[1-9][0-9]*$/.test(record.costCeiling)
    )
      throw new ConfigurationError("Invalid C5 gas commitment");
    if (record.chainId !== c5ActionPolicy(record.action).chainId.toString())
      throw new ConfigurationError("C5 gas commitment chain differs from action approval");
    if (record.chainId !== chainId.toString()) continue;
    const previous = commitments.get(record.action);
    const ceiling = BigInt(record.costCeiling);
    if (previous !== undefined && previous !== ceiling)
      throw new ConfigurationError("C5 conflicting gas commitment");
    commitments.set(record.action, ceiling);
  }
  const committed = [...commitments.values()].reduce((sum, value) => sum + value, 0n);
  if (cost <= 0n || committed + cost > cap) throw new ConfigurationError("C5 gas cap exceeded");
}
