import { c5Terms, c5Times } from "@morrow/sdk/src/c5-config.ts";
import type { C5Job } from "./c5-state.ts";

export function c5Retry(job: C5Job, error: string, attempt: number, now: bigint) {
  const finality =
    error === "Funding transaction is unfinalized" ||
    error === "C5 refusal source assignment is unfinalized";
  const finalityMatches =
    (job.operation === "assign" && error === "Funding transaction is unfinalized") ||
    (job.operation === "refusal" && error === "C5 refusal source assignment is unfinalized");
  const cutoff = job.operation === "assign" ? c5Terms(0n, 2n).assignBefore : c5Times.maturity;
  const proof404 =
    job.operation.startsWith("proof-") && error.includes("Request failed with status code 404");
  const boundary =
    ((job.operation === "cancel1" || job.operation === "cancel2") &&
      error === "C5 source cancellation too early") ||
    (job.operation === "redeem" && error === "C5 source redemption too early");
  const network =
    error === "Error: ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC" ||
    /(?:TIMEOUT|NETWORK_ERROR|SERVER_ERROR|EPROTO|ECONNRESET|ETIMEDOUT|ECONNREFUSED|EAI_AGAIN|UND_ERR_CONNECT_TIMEOUT)\b/.test(
      error,
    );
  const limit = boundary ? 4 : finality ? 20 : proof404 ? 12 : job.operation === "refusal" ? 3 : 30;
  const retry =
    (finality ? finalityMatches && now < cutoff : boundary || proof404 || network) &&
    attempt < limit;
  return {
    retry,
    delayMs: attempt <= 1 ? 30000 : 60000,
    limit,
    reason: retry
      ? "retryable-dependency"
      : attempt >= limit
        ? "retry-budget-exhausted"
        : "semantic-stop",
  };
}
