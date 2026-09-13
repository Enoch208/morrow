import type { Address, EvidenceLabel, Hash, SaleTerms } from "@morrow/protocol";
import { findRow, loadCampaignLog, type CampaignRow } from "./campaign-log";
import { isHex, numberField, recordField, stringField } from "./json-fields";
import { milestoneLabel } from "./milestone-labels";
import { readReservationProof, type ReservationProof } from "./reservation-proof";
import { recordedWithdrawal, type RecordedWithdrawal } from "./recorded-withdrawal";
import { parseSaleTerms } from "./sale-terms";

export interface Milestone {
  readonly label: string;
  readonly observedAt: string | undefined;
  readonly transactionHash: string | undefined;
  readonly blockNumber: number | undefined;
  readonly note: string | undefined;
  readonly complete: boolean;
}

export interface ClaimATransactions {
  readonly create: string;
  readonly reserve: string;
  readonly fund: string;
  readonly assign: string;
}

export interface ClaimAWithdrawals {
  readonly seller: RecordedWithdrawal | undefined;
  readonly fee: RecordedWithdrawal | undefined;
}

export interface ClaimASnapshot {
  readonly saleId: Hash;
  readonly transactions: ClaimATransactions;
  readonly terms: SaleTerms;
  readonly withdrawals: ClaimAWithdrawals;
  readonly milestones: readonly Milestone[];
  readonly assignedAt: string;
  readonly currentBeneficiary: Address;
  readonly cancelRefusalError: string | undefined;
  readonly wrongSaleError: string | undefined;
  readonly proof: ReservationProof;
  readonly snapshotAt: string;
  readonly evidenceLabel: EvidenceLabel;
}

export type ClaimAEvidence =
  | { readonly status: "available"; readonly snapshot: ClaimASnapshot }
  | { readonly status: "unavailable"; readonly reason: string };

const heroSteps = [
  { action: "a-reserve", state: "reservation-verified", suffix: "reserve" },
  { action: "a-fund", state: "bound-verified", suffix: "fund" },
  { action: "a-assign", state: "assignment-verified", suffix: "assign" },
  { action: "a-assign-archive", state: "archived", suffix: "assign-archive" },
  { action: "a-settle", state: "outcome-verified", suffix: "settle" },
  { action: "a-withdraw", state: "withdrawal-verified", suffix: "withdraw" },
] as const;

function buildMilestones(rows: readonly CampaignRow[]): readonly Milestone[] {
  return heroSteps.map((step) => {
    const row = findRow(rows, step.action, step.state);
    const role = step.suffix === "withdraw" ? "SELLER" : undefined;
    const label = milestoneLabel(step.suffix, step.state, role)?.label ?? step.action;
    return {
      label,
      observedAt: row?.observedAt,
      transactionHash: row ? stringField(row.fields, "transactionHash") : undefined,
      blockNumber: row ? numberField(row.fields, "blockNumber") : undefined,
      note: row ? undefined : "Not yet recorded",
      complete: row !== undefined,
    };
  });
}

function transactionHashes(
  ...rows: readonly (CampaignRow | undefined)[]
): ClaimATransactions | undefined {
  const hashes = rows.map((row) => (row ? stringField(row.fields, "transactionHash") : undefined));
  const [create, reserve, fund, assign] = hashes;
  if (!create || !reserve || !fund || !assign) {
    return undefined;
  }
  return { create, reserve, fund, assign };
}

export function loadClaimAEvidence(): ClaimAEvidence {
  const rows = loadCampaignLog();
  if (!rows) {
    return { status: "unavailable", reason: "Campaign log not found" };
  }
  const created = findRow(rows, "a-create", "claim-verified");
  const reserved = findRow(rows, "a-reserve", "reservation-verified");
  const funded = findRow(rows, "a-fund", "bound-verified");
  const assigned = findRow(rows, "a-assign", "assignment-verified");
  const transactions = transactionHashes(created, reserved, funded, assigned);
  const proofRow = findRow(rows, "a-reserve-proof", "native-verified");
  const termsRecord = funded ? recordField(funded.fields, "terms") : undefined;
  const terms = termsRecord ? parseSaleTerms(termsRecord) : undefined;
  const saleId = funded ? stringField(funded.fields, "saleId") : undefined;
  const claim = assigned ? recordField(assigned.fields, "claim") : undefined;
  const beneficiary = claim ? stringField(claim, "currentBeneficiary") : undefined;
  const proof = proofRow ? readReservationProof(proofRow) : undefined;
  const latest = rows.at(-1);

  if (
    !terms ||
    !isHex(saleId) ||
    !assigned ||
    !isHex(beneficiary) ||
    !proof ||
    !latest ||
    !transactions
  ) {
    return {
      status: "unavailable",
      reason: "Claim A has not reached assignment in the evidence log",
    };
  }

  return {
    status: "available",
    snapshot: {
      saleId,
      transactions,
      terms,
      withdrawals: {
        seller: recordedWithdrawal(findRow(rows, "a-withdraw", "withdrawal-verified")),
        fee: recordedWithdrawal(findRow(rows, "withdraw-fee", "withdrawal-verified")),
      },
      milestones: buildMilestones(rows),
      assignedAt: assigned.observedAt,
      currentBeneficiary: beneficiary,
      cancelRefusalError: stringField(
        findRow(rows, "assigned-cancel-refusal", "rejection-verified")?.fields ?? {},
        "actualError",
      ),
      wrongSaleError: stringField(
        findRow(rows, "wrong-sale-proof", "rejection-verified")?.fields ?? {},
        "actualError",
      ),
      proof,
      snapshotAt: latest.observedAt,
      evidenceLabel: funded?.evidenceKind ?? "blocked",
    },
  };
}
