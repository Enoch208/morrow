import type { EvidenceLabel, Hash, SaleTerms } from "@morrow/protocol";
import type { ChainKey } from "@/lib/explorers";
import { actionStep, findLatestStep } from "./action-steps";
import { findRow, loadActionLog, type ActionLog, type CampaignRow } from "./campaign-log";
import { isHex, numberField, recordField, stringField } from "./json-fields";
import { milestoneLabel } from "./milestone-labels";
import { parseSaleTerms } from "./sale-terms";

export type ClaimOutcome = "assignment" | "cancellation";

interface CampaignClaimEntry {
  readonly prefix: string;
  readonly name: string;
  readonly path: string;
  readonly expectedOutcome: ClaimOutcome;
  readonly log: ActionLog;
  readonly actionPrefix: string;
}

export const campaignClaims = [
  {
    prefix: "gate",
    name: "Gate claim",
    path: "cancellation path",
    expectedOutcome: "cancellation",
    log: "campaign",
    actionPrefix: "gate",
  },
  {
    prefix: "a",
    name: "Claim A",
    path: "assignment path",
    expectedOutcome: "assignment",
    log: "campaign",
    actionPrefix: "a",
  },
  {
    prefix: "b",
    name: "Claim B",
    path: "cancellation path",
    expectedOutcome: "cancellation",
    log: "campaign",
    actionPrefix: "b",
  },
  {
    prefix: "c",
    name: "Claim C",
    path: "repeat-round path",
    expectedOutcome: "assignment",
    log: "repeatRound",
    actionPrefix: "c5",
  },
] as const satisfies readonly CampaignClaimEntry[];

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
  readonly path: string;
  readonly outcome: ClaimOutcome;
  readonly claimId: string;
  readonly saleId: Hash;
  readonly fundingHash: string | undefined;
  readonly terms: SaleTerms;
  readonly milestones: readonly LedgerMilestone[];
  readonly complete: boolean;
}

export interface CampaignLedger {
  readonly claims: readonly LedgerClaim[];
  readonly snapshotAt: string | undefined;
}

type ActionLogs = Readonly<Record<ActionLog, readonly CampaignRow[]>>;

function rowsFor(logs: ActionLogs, entry: (typeof campaignClaims)[number]): readonly CampaignRow[] {
  const rows = logs[entry.log];
  const owned = rows.filter((row) => row.action.startsWith(`${entry.actionPrefix}-`));
  return entry.prefix === "a"
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
  actionPrefix: string,
  owned: readonly CampaignRow[],
): LedgerMilestone | undefined {
  const { round, step } = actionStep(row.action, actionPrefix);
  const label = milestoneLabel(step, row.state, stringField(row.fields, "role"));
  if (!label) {
    return undefined;
  }
  return {
    key: `${row.action}:${row.state}:${row.observedAt}`,
    label: round === undefined ? label.label : `Round ${round.toString()} · ${label.label}`,
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
  logs: ActionLogs,
  entry: (typeof campaignClaims)[number],
): LedgerClaim | undefined {
  const owned = rowsFor(logs, entry);
  const latest = (step: string, state: string) =>
    findLatestStep(owned, entry.actionPrefix, step, state);
  const funded = latest("fund", "bound-verified");
  const anchor = funded ?? latest("reserve", "reservation-verified");
  const termsRecord = anchor ? recordField(anchor.fields, "terms") : undefined;
  const terms = termsRecord ? parseSaleTerms(termsRecord) : undefined;
  const saleId = anchor ? stringField(anchor.fields, "saleId") : undefined;
  if (!terms || !isHex(saleId)) {
    return undefined;
  }
  const settled = latest("settle", "outcome-verified");
  const refunded = latest("refund", "outcome-verified");
  const redeemed = latest("redeem", "redemption-verified");

  return {
    prefix: entry.prefix,
    name: entry.name,
    path: entry.path,
    outcome: settled ? "assignment" : refunded ? "cancellation" : entry.expectedOutcome,
    claimId: terms.claimId.toString(),
    saleId,
    fundingHash: funded ? stringField(funded.fields, "transactionHash") : undefined,
    terms,
    milestones: latestPerLabel(
      owned
        .map((row) => toMilestone(row, entry.actionPrefix, owned))
        .filter((milestone): milestone is LedgerMilestone => milestone !== undefined),
    ),
    complete: (settled ?? refunded) !== undefined && redeemed !== undefined,
  };
}

function latestObservation(logs: ActionLogs): string | undefined {
  return Object.values(logs)
    .map((rows) => rows.at(-1)?.observedAt)
    .filter((observedAt): observedAt is string => observedAt !== undefined)
    .sort()
    .at(-1);
}

export function loadCampaignLedger(): CampaignLedger | undefined {
  const campaign = loadActionLog("campaign");
  if (!campaign) {
    return undefined;
  }
  const logs: ActionLogs = { campaign, repeatRound: loadActionLog("repeatRound") ?? [] };
  return {
    claims: campaignClaims
      .map((entry) => buildClaim(logs, entry))
      .filter((claim): claim is LedgerClaim => claim !== undefined),
    snapshotAt: latestObservation(logs),
  };
}
