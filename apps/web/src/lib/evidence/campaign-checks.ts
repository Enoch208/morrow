import type { EvidenceLabel } from "@morrow/protocol";
import { findRow, loadCampaignLog, type CampaignRow } from "./campaign-log";
import { booleanField, numberField, stringField } from "./json-fields";

export interface CampaignCheck {
  readonly title: string;
  readonly claim: string;
  readonly expectation: string;
  readonly actualError: string;
  readonly detail: string;
  readonly observedAt: string;
  readonly evidenceKind: EvidenceLabel;
}

function check(
  row: CampaignRow | undefined,
  title: string,
  claim: string,
  expectation: string,
  detail: (row: CampaignRow) => string,
): CampaignCheck | undefined {
  const actualError = row ? stringField(row.fields, "actualError") : undefined;
  if (!row || !actualError) {
    return undefined;
  }
  return {
    title,
    claim,
    expectation,
    actualError,
    detail: detail(row),
    observedAt: row.observedAt,
    evidenceKind: row.evidenceKind,
  };
}

function blockDetail(row: CampaignRow, chain: string): string {
  const block = numberField(row.fields, "blockNumber") ?? numberField(row.fields, "sourceBlock");
  const mined = booleanField(row.fields, "mined") === true ? "mined" : "eth_call, not mined";
  return block === undefined ? mined : `${chain} block ${block.toLocaleString("en-US")} · ${mined}`;
}

export function loadCampaignChecks(): readonly CampaignCheck[] {
  const rows = loadCampaignLog() ?? [];
  const wrongSale = findRow(rows, "wrong-sale-proof", "rejection-verified");
  const nativeSameBytes = wrongSale
    ? booleanField(wrongSale.fields, "proofNativeVerifiedWithSameBytes")
    : undefined;

  return [
    check(
      wrongSale,
      "Authentic proof, wrong sale",
      "Claim B proof against Claim A",
      nativeSameBytes === true
        ? "Native verifier accepts the same bytes; the market must still refuse them"
        : "The market must refuse proof bound to a different sale",
      (row) => blockDetail(row, "CC3"),
    ),
    check(
      findRow(rows, "assigned-cancel-refusal", "rejection-verified"),
      "Cancel an assigned round",
      "Claim A",
      "Source vault must refuse cancellation once a round is assigned",
      (row) => blockDetail(row, "Sepolia"),
    ),
    check(
      findRow(rows, "a-deadline-check", "delay-safety-verified"),
      "Cancel after deadline with proof held back",
      "Claim A",
      "Delay changes when evidence arrives, never the source outcome",
      (row) => blockDetail(row, "Sepolia"),
    ),
  ].filter((entry): entry is CampaignCheck => entry !== undefined);
}
