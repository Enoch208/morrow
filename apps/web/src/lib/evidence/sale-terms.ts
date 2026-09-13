import { saleTermsFields, type SaleTerms } from "@morrow/protocol";
import { isHex, stringField, type JsonRecord } from "./json-fields";

type TermsValue = SaleTerms[keyof SaleTerms];

export function parseSaleTerms(record: JsonRecord): SaleTerms | undefined {
  const entries: [string, TermsValue][] = [];
  for (const field of saleTermsFields) {
    const raw = stringField(record, field.name);
    if (raw === undefined) {
      return undefined;
    }
    if (field.type === "address") {
      if (!isHex(raw) || raw.length !== 42) {
        return undefined;
      }
      entries.push([field.name, raw]);
    } else {
      if (!/^\d+$/.test(raw)) {
        return undefined;
      }
      entries.push([field.name, BigInt(raw)]);
    }
  }
  return Object.fromEntries(entries) as SaleTerms;
}
