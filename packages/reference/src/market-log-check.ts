import { EvidenceError } from "./checker-rpc.ts";
import { record } from "./evidence-files.ts";

export function normalizedReceiptLog(value: unknown): Record<string, unknown> {
  const log = record(value);
  if (log.removed !== undefined && log.removed !== false)
    throw new EvidenceError("Removed or malformed market log");
  return { ...log, removed: false };
}
