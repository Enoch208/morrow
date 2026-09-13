import { keccak256, toUtf8Bytes } from "ethers";

const layout = [
  ["protocolVersion", 256],
  ["sourceEvmChainId", 256],
  ["sourceVault", 160],
  ["claimId", 256],
  ["round", 256],
  ["destinationEvmChainId", 256],
  ["destinationMarket", 160],
  ["seller", 160],
  ["buyer", 160],
  ["sourceToken", 160],
  ["sourceFaceValueRaw", 256],
  ["maturity", 256],
  ["settlementToken", 160],
  ["grossPurchasePriceRaw", 256],
  ["feeBps", 16],
  ["feeRecipient", 160],
  ["fundBefore", 256],
  ["assignBefore", 256],
] as const;

function word(value: string | undefined, bits: number): string {
  if (typeof value !== "string") throw new Error("Missing canonical field");
  if (bits === 160) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid canonical address");
    return value.slice(2).toLowerCase().padStart(64, "0");
  }
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("Invalid unsigned decimal integer");
  const integer = BigInt(value);
  if (integer >= 2n ** BigInt(bits)) throw new Error("Canonical integer overflow");
  return integer.toString(16).padStart(64, "0");
}

export function referenceIdentity(terms: Readonly<Record<string, string>>) {
  if (Object.keys(terms).length !== 18)
    throw new Error("Canonical terms require exactly eighteen fields");
  const encodedTerms = "0x" + layout.map(([name, bits]) => word(terms[name], bits)).join("");
  const termsHash = keccak256(encodedTerms);
  const claimKey = keccak256(
    "0x" +
      word(terms.sourceEvmChainId, 256) +
      word(terms.sourceVault, 160) +
      word(terms.claimId, 256),
  );
  const domain = keccak256(toUtf8Bytes("MORROW_FUNDED_PAYMENT_SALE_V1"));
  const saleId = keccak256(
    domain + claimKey.slice(2) + word(terms.round, 256) + termsHash.slice(2),
  );
  return { encodedTerms, claimKey, termsHash, saleId };
}

export function referenceEconomics(price: string, feeBps: string) {
  word(price, 256);
  word(feeBps, 16);
  const p = BigInt(price);
  const f = BigInt(feeBps);
  if (p === 0n || f > 100n) throw new Error("Unsupported sale economics");
  const fee = (p / 10000n) * f + ((p % 10000n) * f) / 10000n;
  return {
    grossPurchasePriceRaw: p.toString(),
    feeRaw: fee.toString(),
    sellerNetRaw: (p - fee).toString(),
  };
}

export function referenceTerms(value: unknown): Record<string, string> {
  if (!Array.isArray(value) || value.length !== 18) throw new Error("Invalid canonical tuple");
  const tuple: unknown[] = value;
  return Object.fromEntries(
    layout.map(([name, bits], index) => {
      const entry = tuple[index];
      if (typeof entry !== "bigint" && typeof entry !== "string")
        throw new Error("Invalid canonical scalar");
      const scalar = entry.toString();
      word(scalar, bits);
      return [name, scalar];
    }),
  );
}

export function referenceEventKey(
  chainKey: bigint,
  height: bigint,
  txIndex: bigint,
  logIndex: bigint,
): string {
  return keccak256(
    "0x" +
      word(chainKey.toString(), 64) +
      word(height.toString(), 64) +
      word(txIndex.toString(), 64) +
      word(logIndex.toString(), 256),
  );
}
