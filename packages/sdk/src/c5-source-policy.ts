import type { SaleTerms } from "@morrow/protocol";
import type { C5SourceOperation } from "./c5-source-checks.ts";
import { c5Times } from "./c5-config.ts";
import { ConfigurationError } from "./errors.ts";

function requireState(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ConfigurationError(`C5 source ${message}`);
}

export function assertC5SourceWindow(
  operation: C5SourceOperation,
  chainTime: bigint,
  wallTime: bigint,
  terms: SaleTerms,
): void {
  requireState(
    chainTime >= wallTime - 120n && chainTime <= wallTime + 30n,
    "clock stale or skewed",
  );
  for (const timestamp of [chainTime, wallTime]) {
    if (operation === "create" || operation === "reserve1")
      requireState(timestamp <= c5Times.launch, "initial launch window expired");
    if (operation === "reserve2")
      requireState(timestamp <= c5Times.round2Launch, "round-2 launch window expired");
    if (operation === "cancel1" || operation === "cancel2")
      requireState(timestamp >= terms.assignBefore, "cancellation too early");
    if (operation === "redeem") requireState(timestamp >= c5Times.maturity, "redemption too early");
  }
}

export function assertC5SourceNotSubmitted(
  records: readonly Record<string, unknown>[],
  action: string,
): void {
  requireState(
    !records.some(
      (record) =>
        record.action === action &&
        ["prepared", "submitted", "mined", "reverted"].includes(String(record.state)),
    ),
    "action has previous submission; reconcile instead of retrying",
  );
}
