export type Hex = `0x${string}`;
export type Address = Hex;
export type Hash = Hex;

export const protocolVersion = 1n;
export const protocolDomainText = "MORROW_FUNDED_PAYMENT_SALE_V1";

export const saleTermsFields = [
  { name: "protocolVersion", type: "uint256" },
  { name: "sourceEvmChainId", type: "uint256" },
  { name: "sourceVault", type: "address" },
  { name: "claimId", type: "uint256" },
  { name: "round", type: "uint256" },
  { name: "destinationEvmChainId", type: "uint256" },
  { name: "destinationMarket", type: "address" },
  { name: "seller", type: "address" },
  { name: "buyer", type: "address" },
  { name: "sourceToken", type: "address" },
  { name: "sourceFaceValueRaw", type: "uint256" },
  { name: "maturity", type: "uint256" },
  { name: "settlementToken", type: "address" },
  { name: "grossPurchasePriceRaw", type: "uint256" },
  { name: "feeBps", type: "uint16" },
  { name: "feeRecipient", type: "address" },
  { name: "fundBefore", type: "uint256" },
  { name: "assignBefore", type: "uint256" },
] as const;

export type SaleTerms = {
  readonly [
    Field in (typeof saleTermsFields)[number] as Field["name"]
  ]: Field["type"] extends "address" ? Address : bigint;
};

export interface SaleIdentity {
  readonly claimKey: Hash;
  readonly termsHash: Hash;
  readonly saleId: Hash;
}

export interface EventIdentity {
  readonly attestcoinChainKey: bigint;
  readonly sourceBlockHeight: bigint;
  readonly provenTxIndex: bigint;
  readonly receiptLocalLogIndex: bigint;
  readonly eventKey: Hash;
}
