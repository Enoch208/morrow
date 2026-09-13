import type { JsonRpcProvider } from "ethers";
import type { submissionContext } from "./submission-context.ts";
import { once } from "./submission-context.ts";
import { submissionRuntime, bytecodeObservation } from "./submission-runtime.ts";
import type { SubmissionLabel, SubmissionObservation } from "./submission-report.ts";
import { EvidenceError } from "./checker-rpc.ts";

export async function submissionInfrastructure(
  add: (
    id: string,
    name: string,
    label: SubmissionLabel,
    operation: () => Promise<SubmissionObservation>,
  ) => Promise<void>,
  context: ReturnType<typeof submissionContext>,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  for (const [role, rpc] of [
    ["vault", source],
    ["market", destination],
  ] as const) {
    const runtime = once(() => submissionRuntime(role, rpc));
    await add(
      `${role}-runtime`,
      `${role}: runtime vs compiled artifact, immutables masked`,
      "live-read-verified",
      async () => {
        const value = await runtime();
        return bytecodeObservation(
          value.runtime.status,
          value.runtime.status === "pass"
            ? `Masked runtime matches; block ${value.blockNumber.toString()}`
            : value.runtime.reasons.join("; "),
          value,
        );
      },
    );
    await add(
      `${role}-selectors`,
      `${role}: dispatcher selectors equal ABI`,
      "live-read-verified",
      async () => {
        const value = await runtime(),
          inspection = value.inspection;
        const status =
          inspection.selectorMatches === true
            ? "pass"
            : inspection.selectorMatches === false
              ? "fail"
              : "unverified";
        return bytecodeObservation(
          status,
          status === "pass"
            ? `${inspection.selectors.length.toString()} exact ABI selectors`
            : inspection.reasons.join("; "),
          value,
        );
      },
    );
    await add(
      `${role}-opcodes`,
      `${role}: no DELEGATECALL, CALLCODE, SELFDESTRUCT, CREATE or CREATE2`,
      "live-read-verified",
      async () => {
        const value = await runtime();
        return bytecodeObservation(
          value.inspection.opcodeStatus,
          value.inspection.opcodeStatus === "pass"
            ? "No forbidden executable opcode; PUSH operands and validated CBOR excluded"
            : value.inspection.reasons.join("; "),
          value,
        );
      },
    );
  }
  await add(
    "release-provenance",
    "Release source and compiled-artifact consistency",
    "local-tested",
    async () => {
      const value = (await context.release()).provenance;
      if (value.status !== "PASS")
        throw new EvidenceError(
          value.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; "),
        );
      return { detail: `Pinned candidate ${value.implementationCommit}`, evidence: value };
    },
  );
}
