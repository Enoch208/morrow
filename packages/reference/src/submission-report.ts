import { EvidenceError } from "./checker-rpc.ts";
import { releaseFailure } from "./release-verification-attempt.ts";

export type SubmissionLabel = "local-tested" | "live-read-verified" | "historical-replay";
export interface SubmissionObservation {
  readonly detail: string;
  readonly evidence?: unknown;
}
export interface SubmissionCheck extends SubmissionObservation {
  readonly id: string;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "UNVERIFIED";
  readonly evidenceKind: SubmissionLabel;
}
export class SubmissionUnverified extends Error {
  readonly evidence: unknown;
  constructor(message: string, evidence?: unknown) {
    super(message);
    this.evidence = evidence;
  }
}

export async function submissionCheck(
  id: string,
  name: string,
  evidenceKind: SubmissionLabel,
  operation: () => Promise<SubmissionObservation>,
): Promise<SubmissionCheck> {
  try {
    return { id, name, evidenceKind, status: "PASS", ...(await operation()) };
  } catch (error: unknown) {
    const failure = releaseFailure(error, 1);
    const missing = error instanceof SubmissionUnverified || failure.kind !== "data";
    return {
      id,
      name,
      evidenceKind,
      status:
        !missing && (error instanceof EvidenceError || error instanceof SyntaxError)
          ? "FAIL"
          : "UNVERIFIED",
      detail:
        error instanceof SubmissionUnverified || error instanceof EvidenceError
          ? error.message
          : failure.detail,
      ...(error instanceof SubmissionUnverified ? { evidence: error.evidence } : {}),
    };
  }
}

export function submissionReport(checks: readonly SubmissionCheck[]) {
  const failed = checks.some((check) => check.status === "FAIL");
  const incomplete = checks.length === 0 || checks.some((check) => check.status === "UNVERIFIED");
  const verdict = failed ? "FAILED" : incomplete ? "UNVERIFIED" : "VERIFIED";
  const clean = (value: string) =>
    value.replace(/[\r\n]/g, " ").replaceAll(String.fromCharCode(27), " ");
  return {
    checks,
    verdict,
    exitCode: failed ? 1 : incomplete ? 2 : 0,
    text: [
      "MORROW — LIVE SUBMISSION VERIFICATION",
      ...checks.map(
        (check) =>
          `${check.status} | ${clean(check.name)} | ${check.evidenceKind} | ${clean(check.detail)}`,
      ),
      `VERDICT: ${verdict}`,
    ].join("\n"),
  };
}
