import type { CampaignRow } from "./campaign-log";
import { numberField, stringField } from "./json-fields";
import { readEvidenceJson } from "./repository-files";

export interface ReservationProof {
  readonly chainKey: number;
  readonly headerNumber: number;
  readonly txIndex: number;
  readonly proofHash: string;
  readonly constructionMs: number;
}

export function readReservationProof(row: CampaignRow): ReservationProof | undefined {
  const proofPath = stringField(row.fields, "proofPath");
  const proofHash = stringField(row.fields, "proofHash");
  const constructionMs = numberField(row.fields, "proofConstructionMs");
  const proofFile = proofPath ? readEvidenceJson(proofPath) : undefined;
  const chainKey = proofFile ? numberField(proofFile, "chainKey") : undefined;
  const headerNumber = proofFile ? numberField(proofFile, "headerNumber") : undefined;
  const txIndex = proofFile ? numberField(proofFile, "txIndex") : undefined;

  if (
    proofHash === undefined ||
    constructionMs === undefined ||
    chainKey === undefined ||
    headerNumber === undefined ||
    txIndex === undefined
  ) {
    return undefined;
  }
  return { chainKey, headerNumber, txIndex, proofHash, constructionMs };
}
