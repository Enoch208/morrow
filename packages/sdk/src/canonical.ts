import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { protocolDomainText, saleTermsFields } from "@morrow/protocol";
import type { Hex, SaleIdentity, SaleTerms } from "@morrow/protocol";

const coder = AbiCoder.defaultAbiCoder();

export function encodeTerms(terms: SaleTerms): Hex {
  return coder.encode(
    saleTermsFields.map((field) => field.type),
    saleTermsFields.map((field) => terms[field.name]),
  ) as Hex;
}

export function saleIdentity(terms: SaleTerms): SaleIdentity {
  const claimKey = keccak256(
    coder.encode(
      ["uint256", "address", "uint256"],
      [terms.sourceEvmChainId, terms.sourceVault, terms.claimId],
    ),
  ) as Hex;
  const termsHash = keccak256(encodeTerms(terms)) as Hex;
  const domain = keccak256(toUtf8Bytes(protocolDomainText));
  const saleId = keccak256(
    coder.encode(
      ["bytes32", "bytes32", "uint256", "bytes32"],
      [domain, claimKey, terms.round, termsHash],
    ),
  ) as Hex;
  return { claimKey, termsHash, saleId };
}

export function quoteEconomics(grossPurchasePriceRaw: bigint, feeBps: bigint) {
  if (grossPurchasePriceRaw <= 0n || feeBps < 0n || feeBps > 100n)
    throw new Error("Unsupported gross price or fee");
  const feeRaw = (grossPurchasePriceRaw * feeBps) / 10000n;
  return { grossPurchasePriceRaw, feeRaw, sellerNetRaw: grossPurchasePriceRaw - feeRaw };
}
