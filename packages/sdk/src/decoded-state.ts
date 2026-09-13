import { Result, getAddress, isAddress } from "ethers";
import type { Address, Claim, SaleTerms } from "@morrow/protocol";
import { saleTermsFields } from "@morrow/protocol";
import { ConfigurationError } from "./errors.ts";

export function decodedInteger(value: unknown): bigint {
  if (typeof value !== "bigint") throw new ConfigurationError("Expected decoded integer");
  return value;
}

export function decodedAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value))
    throw new ConfigurationError("Invalid decoded address");
  return getAddress(value) as Address;
}

export function decodedHash(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value))
    throw new ConfigurationError("Invalid decoded hash");
  return value as `0x${string}`;
}

function decodedBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new ConfigurationError("Invalid decoded boolean");
  return value;
}

export function decodedTuple(value: unknown, length: number): Result {
  if (!(value instanceof Result) || value.length !== length)
    throw new ConfigurationError("Unexpected decoded tuple shape");
  return value;
}

export function decodedTerms(value: unknown): SaleTerms {
  const tuple = decodedTuple(value, 18);
  return Object.fromEntries(
    saleTermsFields.map((field, index) => [
      field.name,
      field.type === "address" ? decodedAddress(tuple[index]) : decodedInteger(tuple[index]),
    ]),
  ) as SaleTerms;
}

export function decodedClaim(value: unknown, claimId: bigint): Claim {
  const tuple = decodedTuple(value, 10);
  return {
    claimId,
    sourceToken: decodedAddress(tuple[0]),
    sourceFaceValueRaw: decodedInteger(tuple[1]),
    maturity: decodedInteger(tuple[2]),
    originalBeneficiary: decodedAddress(tuple[3]),
    currentBeneficiary: decodedAddress(tuple[4]),
    activeRound: decodedInteger(tuple[5]),
    latestRound: decodedInteger(tuple[6]),
    successfulSale: decodedBoolean(tuple[7]),
    redeemed: decodedBoolean(tuple[8]),
    referenceHash: decodedHash(tuple[9]),
  };
}
