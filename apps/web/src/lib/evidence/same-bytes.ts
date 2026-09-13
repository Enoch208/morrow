import { findRow, loadCampaignLog } from "./campaign-log";
import { isHex, numberField, recordField, stringField } from "./json-fields";

export interface SameBytesEvidence {
  readonly nativeCalldata: string;
  readonly marketCalldata: string;
  readonly recordedBlock: number;
  readonly recordedError: string;
  readonly proofSource: string;
}

export function loadSameBytesEvidence(): SameBytesEvidence | undefined {
  const rows = loadCampaignLog() ?? [];
  const refusal = findRow(rows, "wrong-sale-proof", "rejection-verified");
  const proofHash = refusal ? stringField(refusal.fields, "proofHash") : undefined;
  const marketCalldata = refusal ? stringField(refusal.fields, "calldata") : undefined;
  const recordedBlock = refusal ? numberField(refusal.fields, "blockNumber") : undefined;
  const recordedError = refusal ? stringField(refusal.fields, "actualError") : undefined;
  const proofRow = [...rows]
    .reverse()
    .find(
      (row) =>
        row.state === "native-verified" && stringField(row.fields, "proofHash") === proofHash,
    );
  const native = proofRow ? recordField(proofRow.fields, "native") : undefined;
  const verification = native ? recordField(native, "verification") : undefined;
  const nativeCalldata = verification ? stringField(verification, "calldata") : undefined;

  if (
    !proofRow ||
    !isHex(nativeCalldata) ||
    !isHex(marketCalldata) ||
    recordedBlock === undefined ||
    !recordedError
  ) {
    return undefined;
  }
  return {
    nativeCalldata,
    marketCalldata,
    recordedBlock,
    recordedError,
    proofSource: proofRow.action,
  };
}
