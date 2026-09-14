import { Interface, Result, getAddress, isHexString } from "ethers";
import type { Address, Claim, Hash, SaleTerms } from "@morrow/protocol";
import { destinationStates, saleTermsFields } from "@morrow/protocol";
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import { saleIdentity } from "../../sdk/src/canonical.ts";

export const vaultInterface = new Interface(vaultAbi);
export const marketInterface = new Interface(marketAbi);

export function tuple(value: unknown): Result {
  if (!(value instanceof Result)) throw new Error("Malformed ABI tuple");
  return value;
}

export function raw(value: unknown): bigint {
  if (typeof value !== "bigint" || value < 0n) throw new Error("Malformed unsigned integer");
  return value;
}

export function address(value: unknown): Address {
  if (typeof value !== "string") throw new Error("Malformed address");
  return getAddress(value) as Address;
}

function hash(value: unknown): Hash {
  if (typeof value !== "string" || !isHexString(value, 32)) throw new Error("Malformed hash");
  return value;
}

function flag(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Malformed flag");
  return value;
}

export function decodeClaim(claimId: bigint, encoded: string): Claim {
  const claim = tuple(vaultInterface.decodeFunctionResult("getClaim", encoded)[0]);
  return {
    claimId,
    sourceToken: address(claim.getValue("sourceToken")),
    sourceFaceValueRaw: raw(claim.getValue("sourceFaceValueRaw")),
    maturity: raw(claim.getValue("maturity")),
    originalBeneficiary: address(claim.getValue("originalBeneficiary")),
    currentBeneficiary: address(claim.getValue("currentBeneficiary")),
    activeRound: raw(claim.getValue("activeRound")),
    latestRound: raw(claim.getValue("latestRound")),
    successfulSale: flag(claim.getValue("successfulSale")),
    redeemed: flag(claim.getValue("redeemed")),
    referenceHash: hash(claim.getValue("referenceHash")),
  };
}

function termsFrom(value: unknown): SaleTerms {
  const values = tuple(value);
  return Object.fromEntries(
    saleTermsFields.map((field) => [
      field.name,
      field.type === "address"
        ? address(values.getValue(field.name))
        : raw(values.getValue(field.name)),
    ]),
  ) as unknown as SaleTerms;
}

export function decodeSale(saleId: Hash, encoded: string) {
  const sale = tuple(marketInterface.decodeFunctionResult("getSale", encoded)[0]);
  const state = destinationStates[Number(raw(sale.getValue("state")))];
  if (!state) throw new Error("Unknown destination state");
  if (state === "ABSENT") return { saleId, state, terms: null } as const;
  const terms = termsFrom(sale.getValue("terms"));
  if (saleIdentity(terms).saleId.toLowerCase() !== saleId.toLowerCase()) {
    throw new Error("Sale identity does not match the returned canonical terms");
  }
  return { saleId, state, terms } as const;
}
