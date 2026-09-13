import { evidenceLabels, type EvidenceLabel } from "@morrow/protocol";
import { isRecord, stringField, type JsonRecord } from "./json-fields";
import { readEvidenceText } from "./repository-files";

export interface CampaignRow {
  readonly observedAt: string;
  readonly action: string;
  readonly state: string;
  readonly evidenceKind: EvidenceLabel;
  readonly fields: JsonRecord;
}

const actionLogPaths = {
  campaign: "evidence/campaign/actions.jsonl",
  repeatRound: "evidence/c5/actions.jsonl",
} as const;

export type ActionLog = keyof typeof actionLogPaths;

function isEvidenceLabel(value: string | undefined): value is EvidenceLabel {
  return evidenceLabels.some((label) => label === value);
}

function toCampaignRow(line: string): CampaignRow | undefined {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed)) {
    return undefined;
  }
  const observedAt = stringField(parsed, "observedAt");
  const action = stringField(parsed, "action");
  const state = stringField(parsed, "state");
  const evidenceKind = stringField(parsed, "evidenceKind");
  if (!observedAt || !action || !state || !isEvidenceLabel(evidenceKind)) {
    return undefined;
  }
  return { observedAt, action, state, evidenceKind, fields: parsed };
}

export function loadActionLog(log: ActionLog): readonly CampaignRow[] | undefined {
  const text = readEvidenceText(actionLogPaths[log]);
  if (text === undefined) {
    return undefined;
  }
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map(toCampaignRow)
    .filter((row): row is CampaignRow => row !== undefined);
}

export function loadCampaignLog(): readonly CampaignRow[] | undefined {
  return loadActionLog("campaign");
}

export function findRow(
  rows: readonly CampaignRow[],
  action: string,
  state: string,
): CampaignRow | undefined {
  return [...rows].reverse().find((row) => row.action === action && row.state === state);
}
