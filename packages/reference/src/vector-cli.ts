import { referenceIdentity } from "./index.ts";

const terms = {
  protocolVersion: "1",
  sourceEvmChainId: "11155111",
  sourceVault: "0x0000000000000000000000000000000000001001",
  claimId: "1",
  round: "1",
  destinationEvmChainId: "102031",
  destinationMarket: "0x0000000000000000000000000000000000001002",
  seller: "0x0000000000000000000000000000000000001003",
  buyer: "0x0000000000000000000000000000000000001004",
  sourceToken: "0x0000000000000000000000000000000000001005",
  sourceFaceValueRaw: "10000000000",
  maturity: "1800000000",
  settlementToken: "0x0000000000000000000000000000000000001006",
  grossPurchasePriceRaw: "9410000000",
  feeBps: "50",
  feeRecipient: "0x0000000000000000000000000000000000001007",
  fundBefore: "1799990000",
  assignBefore: "1799991000",
};
process.stdout.write(
  JSON.stringify(
    {
      evidenceKind: "local-tested",
      purpose: "Canonical encoding test vector; fixture addresses are not deployments",
      terms,
      ...referenceIdentity(terms),
    },
    null,
    2,
  ) + "\n",
);
