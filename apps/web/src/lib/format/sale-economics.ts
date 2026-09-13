import type { SaleTerms } from "@morrow/protocol";
import { feeFor, formatUnits } from "./token-units";

const testTokenDecimals = 6;

export interface DiscountPoint {
  readonly priceLabel: string;
  readonly holdingReturnPercent: number;
  readonly discountToFacePercent: number;
}

export interface SaleEconomics {
  readonly buyerGrossGain: string;
  readonly fee: string;
  readonly feeBps: string;
  readonly holdingReturnPercent: string;
  readonly faceValue: string;
  readonly points: readonly DiscountPoint[];
}

function percentHundredths(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 10_000n * 2n + denominator) / (2n * denominator);
}

function percentText(numerator: bigint, denominator: bigint): string {
  const hundredths = percentHundredths(numerator, denominator);
  return `${(hundredths / 100n).toString()}.${(hundredths % 100n).toString().padStart(2, "0")}`;
}

function percentNumber(numerator: bigint, denominator: bigint): number {
  return Number(percentHundredths(numerator, denominator)) / 100;
}

function discountPoints(faceValueRaw: bigint): readonly DiscountPoint[] {
  return Array.from({ length: 11 }, (_, index) => {
    const price = (faceValueRaw * BigInt(90 + index)) / 100n;
    return {
      priceLabel: formatUnits(price, testTokenDecimals),
      holdingReturnPercent: percentNumber(faceValueRaw - price, price),
      discountToFacePercent: percentNumber(faceValueRaw - price, faceValueRaw),
    };
  });
}

export function saleEconomics(terms: SaleTerms): SaleEconomics {
  const gain = terms.sourceFaceValueRaw - terms.grossPurchasePriceRaw;
  return {
    buyerGrossGain: formatUnits(gain, testTokenDecimals),
    fee: formatUnits(feeFor(terms.grossPurchasePriceRaw, terms.feeBps), testTokenDecimals),
    feeBps: terms.feeBps.toString(),
    holdingReturnPercent: percentText(gain, terms.grossPurchasePriceRaw),
    faceValue: formatUnits(terms.sourceFaceValueRaw, testTokenDecimals),
    points: discountPoints(terms.sourceFaceValueRaw),
  };
}
