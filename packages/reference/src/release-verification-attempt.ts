import { EvidenceError } from "./checker-rpc.ts";
import { TransientEvidenceError, verificationWithRetry } from "./verification-retry.ts";

export interface ReleaseFailure {
  readonly attempt: number;
  readonly kind: "transport" | "data" | "dependency";
  readonly detail: string;
}

export function releaseFailure(error: unknown, attempt: number): ReleaseFailure {
  const code =
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_/-]+$/.test(error.code)
      ? error.code
      : null;
  const transient =
    error instanceof TransientEvidenceError ||
    (code !== null &&
      [
        "TIMEOUT",
        "NETWORK_ERROR",
        "SERVER_ERROR",
        "ECONNRESET",
        "ETIMEDOUT",
        "EPROTO",
        "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
      ].includes(code));
  return {
    attempt,
    kind: transient ? "transport" : code === "ENOENT" || code === "EACCES" ? "dependency" : "data",
    detail:
      error instanceof EvidenceError
        ? error.message
        : error instanceof SyntaxError
          ? "Malformed evidence JSON"
          : (code ?? "Unclassified dependency or data error"),
  };
}

export async function releaseVerificationAttempt<T>(operation: () => Promise<T>) {
  let attempts = 0;
  const failures: ReleaseFailure[] = [];
  try {
    const verified = await verificationWithRetry(async () => {
      attempts++;
      try {
        return await operation();
      } catch (error: unknown) {
        const failure = releaseFailure(error, attempts);
        failures.push(failure);
        if (failure.kind === "transport") throw new TransientEvidenceError(failure.detail);
        throw new EvidenceError(failure.detail);
      }
    });
    return { status: "verified" as const, result: verified.result, attempts, failures };
  } catch (error: unknown) {
    if (failures.length === 0) failures.push(releaseFailure(error, attempts));
    return { status: "unverifiable" as const, result: null, attempts, failures };
  }
}
