import { EvidenceError } from "./checker-rpc.ts";
import { SubmissionUnverified } from "./submission-report.ts";

interface C5Attempt {
  result: {
    c5Verified: boolean;
    missing: readonly string[];
    verified: readonly string[];
  } | null;
  failures: readonly {
    kind: "transport" | "data" | "dependency";
    detail: string;
  }[];
}

export function submissionC5Observation(attempt: C5Attempt, id: string) {
  if (!attempt.result && attempt.failures.some((failure) => failure.kind === "data"))
    throw new EvidenceError(
      `c5-verify rejected evidence: ${attempt.failures.map((failure) => failure.detail).join("; ")}`,
    );
  if (!attempt.result?.c5Verified)
    throw new SubmissionUnverified(
      `c5-verify has not passed: ${attempt.result?.missing.join(", ") ?? attempt.failures.map((failure) => failure.detail).join("; ")}`,
      attempt,
    );
  if (attempt.result.missing.length > 0 || !attempt.result.verified.includes(id))
    throw new EvidenceError(`C5 pass omitted or contradicted ${id}`);
  return { detail: "c5-verify passed the complete campaign", evidence: attempt };
}
