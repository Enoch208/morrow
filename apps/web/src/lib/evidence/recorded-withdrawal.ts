import type { CampaignRow } from "./campaign-log";
import { isHex, stringField } from "./json-fields";

export interface RecordedWithdrawal {
  readonly amountRaw: bigint;
  readonly transactionHash: string;
}

export function recordedWithdrawal(row: CampaignRow | undefined): RecordedWithdrawal | undefined {
  if (row?.state !== "withdrawal-verified") {
    return undefined;
  }
  const amount = stringField(row.fields, "amount");
  const transactionHash = stringField(row.fields, "transactionHash");
  if (amount === undefined || !/^\d+$/.test(amount) || !isHex(transactionHash)) {
    return undefined;
  }
  return { amountRaw: BigInt(amount), transactionHash };
}
