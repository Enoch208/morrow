import { setTimeout } from "node:timers/promises";
import { EvidenceError } from "./checker-rpc.ts";

export class TransientEvidenceError extends EvidenceError {}

export async function verificationWithRetry<T>(operation: () => Promise<T>) {
  const transientFailures: string[] = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return { result: await operation(), attempts: attempt, transientFailures };
    } catch (error: unknown) {
      if (!(error instanceof TransientEvidenceError) || attempt === 3) throw error;
      transientFailures.push(error.message);
      await setTimeout(attempt * 1000);
    }
  }
  throw new EvidenceError("Verification retry budget exhausted");
}
