import type { SaleTerms } from "@morrow/protocol";
import { feeFor, formatUnits } from "./token-units";

const testTokenDecimals = 6;

export interface SaleAmounts {
  readonly faceValue: string;
  readonly grossPrice: string;
  readonly fee: string;
  readonly sellerNet: string;
}

export function saleAmounts(terms: SaleTerms): SaleAmounts {
  const feeRaw = feeFor(terms.grossPurchasePriceRaw, terms.feeBps);
  return {
    faceValue: formatUnits(terms.sourceFaceValueRaw, testTokenDecimals),
    grossPrice: formatUnits(terms.grossPurchasePriceRaw, testTokenDecimals),
    fee: formatUnits(feeRaw, testTokenDecimals),
    sellerNet: formatUnits(terms.grossPurchasePriceRaw - feeRaw, testTokenDecimals),
  };
}
