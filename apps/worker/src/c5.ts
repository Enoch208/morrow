import { c5Terms, c5Times } from "@morrow/sdk/src/c5-config.ts";
import { c5Complete, c5Job, c5Unresolved } from "./c5-state.ts";
import type { C5Job, C5Row } from "./c5-state.ts";

export interface C5Plan {
  readonly state: "ready" | "waiting" | "complete" | "reconcile" | "blocked";
  readonly reason: string;
  readonly job?: C5Job;
  readonly notBefore?: string;
  readonly c5EvidenceComplete?: boolean;
}

export function c5Plan(
  records: readonly C5Row[],
  now: bigint,
  locks: ReadonlySet<string> = new Set(),
  stopped: ReadonlySet<string> = new Set(),
): C5Plan {
  const unresolved = c5Unresolved(records, locks);
  if (unresolved) return { state: "reconcile", reason: `Unresolved transaction: ${unresolved}` };
  const done = (operation: string) => c5Complete(c5Job(operation).action, records);
  const stoppedJob = (operation: string) => stopped.has(c5Job(operation).action);
  const ready = (operation: string): C5Plan => ({
    state: "ready",
    reason: "Approved dependency satisfied",
    job: c5Job(operation),
  });
  const waiting = (timestamp: bigint, reason: string): C5Plan => ({
    state: "waiting",
    reason,
    notBefore: timestamp.toString(),
  });
  const final = (): C5Plan => ({
    state: "complete",
    reason: "Verified cleanup completed",
    c5EvidenceComplete: done("refusal") && done("proof-r1-reserve"),
  });
  const redemption = (reason: string, terminal: boolean): C5Plan => {
    if (done("redeem")) return terminal ? final() : { state: "blocked", reason };
    if (stoppedJob("redeem"))
      return { state: "blocked", reason: "Source redemption needs intervention" };
    return now >= c5Times.maturity ? ready("redeem") : waiting(c5Times.maturity, reason);
  };
  if (!c5Complete("c5-create", records) || !c5Complete("c5-r1-reserve", records))
    return {
      state: "blocked",
      reason: "Main operator must finish verified creation and round-1 reservation",
    };
  const first = c5Terms(0n, 1n);
  const second = c5Terms(0n, 2n);
  if (!done("cancel1")) {
    if (now >= first.assignBefore)
      return stoppedJob("cancel1")
        ? { state: "blocked", reason: "Round-1 cancellation needs intervention" }
        : ready("cancel1");
    if (now < c5Times.maturity && !done("proof-r1-reserve") && !stoppedJob("proof-r1-reserve"))
      return ready("proof-r1-reserve");
    return waiting(first.assignBefore, "Awaiting source round-1 cancellation deadline");
  }
  if (!done("reserve2")) {
    if (now <= c5Times.round2Launch && !stoppedJob("reserve2")) return ready("reserve2");
    return redemption("Round-2 launch unavailable; source seller redemption remains", true);
  }
  if (done("assign")) {
    if (!done("settle")) {
      if (!done("proof-r2-assign"))
        return stoppedJob("proof-r2-assign")
          ? redemption("Assignment proof unavailable; destination remains unresolved", false)
          : ready("proof-r2-assign");
      if (!done("refusal") && !stoppedJob("refusal")) return ready("refusal");
      return stoppedJob("settle")
        ? redemption("Matching assignment settlement needs intervention", false)
        : ready("settle");
    }
    for (const operation of ["withdraw-seller", "withdraw-fee"])
      if (!done(operation))
        return stoppedJob(operation)
          ? redemption("Destination withdrawal needs intervention", false)
          : ready(operation);
    if (now < c5Times.maturity && !done("proof-r1-reserve") && !stoppedJob("proof-r1-reserve"))
      return ready("proof-r1-reserve");
    return redemption("Awaiting source buyer maturity", true);
  }
  if (!done("cancel2")) {
    if (now >= second.assignBefore)
      return stoppedJob("cancel2")
        ? { state: "blocked", reason: "Round-2 cancellation needs intervention" }
        : ready("cancel2");
    if (done("fund"))
      return stoppedJob("assign")
        ? waiting(second.assignBefore, "Assignment stopped; await legitimate source cancellation")
        : ready("assign");
    const prerequisites = ["proof-r1-cancel", "proof-r2-reserve", "approve-settlement", "fund"];
    if (now < second.fundBefore - 600n && !prerequisites.some(stoppedJob)) {
      const next = prerequisites.find((operation) => !done(operation));
      if (next) return ready(next);
    }
    return waiting(
      second.assignBefore,
      "Funding unavailable; await legitimate source cancellation",
    );
  }
  if (done("fund")) {
    for (const operation of ["proof-r2-cancel", "refund", "withdraw-buyer"])
      if (!done(operation))
        return stoppedJob(operation)
          ? redemption("Cancellation refund needs intervention", false)
          : ready(operation);
  } else if (done("approve-settlement") && !done("revoke-settlement")) {
    if (stoppedJob("revoke-settlement"))
      return redemption("Unused allowance revocation needs intervention", false);
    return ready("revoke-settlement");
  }
  return redemption("Awaiting source seller maturity", true);
}
