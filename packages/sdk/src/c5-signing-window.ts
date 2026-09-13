import type { SaleTerms } from "@morrow/protocol";
import { assertC5Admission } from "./c5-destination-checks.ts";
import { assertC5ReadinessTimestamp } from "./c5-readiness-policy.ts";
import { c5Terms, c5Times } from "./c5-config.ts";
import { ConfigurationError } from "./errors.ts";

export async function withC5FundingAdmission(
  terms: SaleTerms,
  timestamps: readonly bigint[],
  verify: () => Promise<void>,
  clock: () => bigint = () => BigInt(Math.floor(Date.now() / 1000)),
): Promise<void> {
  const started = clock();
  for (const timestamp of timestamps) assertC5Admission(terms, timestamp, started);
  await verify();
  const completed = clock();
  for (const timestamp of timestamps) assertC5Admission(terms, timestamp, completed);
}

export function assertC5SigningWindow(action: string, ready: unknown, now = Date.now()): void {
  if (!Number.isSafeInteger(now) || now < 0)
    throw new ConfigurationError("C5 signing clock invalid");
  assertC5ReadinessTimestamp(
    ready,
    now,
    ["c5-create", "c5-r1-reserve", "c5-approve-source"].includes(action),
  );
  const timestamp = BigInt(Math.floor(now / 1000));
  const terms = c5Terms(0n, 2n);
  if (action === "c5-r2-reserve" && timestamp > c5Times.round2Launch)
    throw new ConfigurationError("C5 round-2 launch window elapsed before signing");
  if (action === "c5-r2-fund") assertC5Admission(terms, timestamp, timestamp);
  if (action === "c5-r2-assign" && timestamp >= terms.assignBefore)
    throw new ConfigurationError("C5 assignment deadline reached before signing");
  if (
    (action === "c5-approve-source" && timestamp >= c5Times.launch) ||
    (action === "c5-approve-settlement" && timestamp >= terms.fundBefore)
  )
    throw new ConfigurationError("C5 allowance admission window elapsed before signing");
}
