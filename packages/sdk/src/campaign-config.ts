import type { SaleTerms } from "@morrow/protocol";
import { ConfigurationError } from "./errors.ts";

export const campaignActors = {
  PAYER: "0x9DDB9007583a7b9DF073B65bCE820f77D6E2365D",
  SELLER: "0xB9e1914C0844d9cd0188AdFFc10e3Bd6A633D12c",
  BUYER: "0x8c48477bd205B0007d32A45ea3b7aE27745FDfbE",
} as const;

export const campaignContracts = {
  sourceToken: {
    address: "0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9",
    chainId: 11155111n,
    name: "MorrowTestToken",
    codeHash: "0x2ebb03f50ccc7b228f8b7eaa868e81f7edbdd47cf4dd98f1dff2655a683ef65e",
  },
  vault: {
    address: "0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583",
    chainId: 11155111n,
    name: "FundedPaymentVault",
    codeHash: "0x0d92b51fec0c1d28e34b701b0f41a56675b2fa2c52ec6097c5100660f31a4560",
  },
  settlementToken: {
    address: "0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0",
    chainId: 102031n,
    name: "MorrowTestToken",
    codeHash: "0x2ebb03f50ccc7b228f8b7eaa868e81f7edbdd47cf4dd98f1dff2655a683ef65e",
  },
  market: {
    address: "0x7c3310280083eE63e32427D11d0A7C2CAf584474",
    chainId: 102031n,
    name: "MorrowMarket",
    codeHash: "0x8104de85a27582fa15cea674c7f19e19a69041586f509b982413b9dead287751",
  },
} as const;

export interface PinnedContract {
  readonly address: string;
  readonly chainId: bigint;
  readonly name: string;
  readonly codeHash: string;
}

export type PinnedContracts = { readonly [K in keyof typeof campaignContracts]: PinnedContract };

export type CampaignName = "gate" | "a" | "b";
export function campaignName(value: string | undefined): CampaignName {
  if (value !== "gate" && value !== "a" && value !== "b")
    throw new ConfigurationError("Choose gate, a or b");
  return value;
}

export function campaignTerms(name: CampaignName, claimId: bigint): SaleTerms {
  return {
    protocolVersion: 1n,
    sourceEvmChainId: 11155111n,
    sourceVault: campaignContracts.vault.address,
    claimId,
    round: 1n,
    destinationEvmChainId: 102031n,
    destinationMarket: campaignContracts.market.address,
    seller: campaignActors.SELLER,
    buyer: campaignActors.BUYER,
    sourceToken: campaignContracts.sourceToken.address,
    sourceFaceValueRaw: name === "gate" ? 10000000n : 10000000000n,
    maturity: name === "a" ? 1789272000n : 1789264800n,
    settlementToken: campaignContracts.settlementToken.address,
    grossPurchasePriceRaw: name === "gate" ? 9410000n : 9410000000n,
    feeBps: 50n,
    feeRecipient: campaignActors.PAYER,
    fundBefore: name === "gate" ? 1789257600n : name === "a" ? 1789259400n : 1789258500n,
    assignBefore: name === "gate" ? 1789259400n : name === "a" ? 1789261200n : 1789260300n,
  };
}

export function assertLaunchWindow(name: CampaignName, timestamp: bigint): void {
  if (timestamp > 1789254900n)
    throw new ConfigurationError(
      `${name} launch window expired; request new deadline approval before funding`,
    );
}
