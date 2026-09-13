import type { EvidenceLabel, Hash, SaleTerms } from "@morrow/protocol";
import type { ChainKey } from "@/lib/explorers";
import { findRow, loadCampaignLog, type CampaignRow } from "./campaign-log";
import { isHex, numberField, recordField, stringField } from "./json-fields";
import { milestoneLabel } from "./milestone-labels";
import { parseSaleTerms } from "./sale-terms";

export const campaignClaims = [
  { prefix: "gate", name: "Gate claim", outcome: "cancellation" },
  { prefix: "a", name: "Claim A", outcome: "assignment" },
  { prefix: "b", name: "Claim B", outcome: "cancellation" },
] as const;

export type CampaignPrefix = (typeof campaignClaims)[number]["prefix"];

export interface LedgerMilestone {
  readonly key: string;
  readonly label: string;
  readonly observedAt: string;
  readonly chain: ChainKey | undefined;
  readonly transactionHash: string | undefined;
  readonly sourceBlock: number | undefined;
  readonly evidenceKind: EvidenceLabel;
}

export interface LedgerClaim {
  readonly prefix: CampaignPrefix;
  readonly name: string;
  readonly outcome: "assignment" | "cancellation";
  readonly claimId: string;
  readonly saleId: Hash;
  readonly terms: SaleTerms;
  readonly milestones: readonly LedgerMilestone[];
  readonly complete: boolean;
}

export interface CampaignLedger {
  readonly claims: readonly LedgerClaim[];
  readonly snapshotAt: string | undefined;
}

function rowsFor(rows: readonly CampaignRow[], prefix: CampaignPrefix): readonly CampaignRow[] {
  const owned = rows.filter((row) => row.action.startsWith(`${prefix}-`));
  return prefix === "a"
    ? [...owned, ...rows.filter((row) => row.action === "withdraw-fee")]
    : owned;
}

function sourceBlockFor(row: CampaignRow, owned: readonly CampaignRow[]): number | undefined {
  const direct = numberField(row.fields, "blockNumber");
  if (direct !== undefined) {
    return direct;
  }
  const mined = findRow(owned, row.action, "mined");
  const receipt = mined ? recordField(mined.fields, "receipt") : undefined;
  return receipt ? numberField(receipt, "blockNumber") : undefined;
}

function toMilestone(
  row: CampaignRow,
  prefix: CampaignPrefix,
  owned: readonly CampaignRow[],
): LedgerMilestone | undefined {
  const suffix = row.action.startsWith(`${prefix}-`)
    ? row.action.slice(prefix.length + 1)
    : row.action;
  const label = milestoneLabel(suffix, row.state, stringField(row.fields, "role"));
  if (!label) {
    return undefined;
  }
  return {
    key: `${row.action}:${row.state}:${row.observedAt}`,
    label: label.label,
    observedAt: row.observedAt,
    chain: label.chain,
    transactionHash: stringField(row.fields, "transactionHash"),
    sourceBlock: label.chain === "sepolia" ? sourceBlockFor(row, owned) : undefined,
    evidenceKind: row.evidenceKind,
  };
}

function latestPerLabel(milestones: readonly LedgerMilestone[]): readonly LedgerMilestone[] {
  const latest = new Map<string, LedgerMilestone>();
  for (const milestone of milestones) {
    latest.set(milestone.label, milestone);
  }
  return [...latest.values()].sort((left, right) =>
    left.observedAt.localeCompare(right.observedAt),
  );
}

function buildClaim(
  rows: readonly CampaignRow[],
  entry: (typeof campaignClaims)[number],
): LedgerClaim | undefined {
  const owned = rowsFor(rows, entry.prefix);
  const funded = findRow(owned, `${entry.prefix}-fund`, "bound-verified");
  const termsRecord = funded ? recordField(funded.fields, "terms") : undefined;
  const terms = termsRecord ? parseSaleTerms(termsRecord) : undefined;
  const saleId = funded ? stringField(funded.fields, "saleId") : undefined;
  if (!terms || !isHex(saleId)) {
    return undefined;
  }
  const milestones = latestPerLabel(
    owned
      .map((row) => toMilestone(row, entry.prefix, owned))
      .filter((milestone): milestone is LedgerMilestone => milestone !== undefined),
  );
  const outcomeAction = entry.outcome === "assignment" ? "settle" : "refund";
  const settled = findRow(owned, `${entry.prefix}-${outcomeAction}`, "outcome-verified");
  const redeemed = findRow(owned, `${entry.prefix}-redeem`, "redemption-verified");

  return {
    prefix: entry.prefix,
    name: entry.name,
    outcome: entry.outcome,
    claimId: terms.claimId.toString(),
    saleId,
    terms,
    milestones,
    complete: settled !== undefined && redeemed !== undefined,
  };
}

export function loadCampaignLedger(): CampaignLedger | undefined {
  const rows = loadCampaignLog();
  if (!rows) {
    return undefined;
  }
  return {
    claims: campaignClaims
      .map((entry) => buildClaim(rows, entry))
      .filter((claim): claim is LedgerClaim => claim !== undefined),
    snapshotAt: rows.at(-1)?.observedAt,
  };
}
