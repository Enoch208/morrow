import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRecord, type JsonRecord } from "./json-fields";

const evidencePrefix = "evidence/";

function evidenceFilePath(repositoryPath: string): string | undefined {
  if (!repositoryPath.startsWith(evidencePrefix) || repositoryPath.includes("..")) {
    return undefined;
  }
  return join(process.cwd(), "..", "..", "evidence", repositoryPath.slice(evidencePrefix.length));
}

export function readEvidenceText(repositoryPath: string): string | undefined {
  const absolutePath = evidenceFilePath(repositoryPath);
  return absolutePath && existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : undefined;
}

export function readEvidenceJson(repositoryPath: string): JsonRecord | undefined {
  const text = readEvidenceText(repositoryPath);
  if (text === undefined) {
    return undefined;
  }
  const parsed: unknown = JSON.parse(text);
  return isRecord(parsed) ? parsed : undefined;
}
