import { custodyAddress } from "./custody-log.ts";
import { ConfigurationError } from "./environment.ts";

export const custodyActions = ["source-token", "vault", "settlement-token", "market"] as const;
export type CustodyAction = (typeof custodyActions)[number];

export function custodyAction(input: string | undefined): CustodyAction {
  const action = custodyActions.find((candidate) => candidate === input);
  if (!action)
    throw new ConfigurationError("Choose source-token, vault, settlement-token or market");
  return action;
}

export async function custodyConfiguration(action: CustodyAction, payer: string) {
  const chainId = action === "source-token" || action === "vault" ? 11155111n : 102031n;
  if (action === "source-token" || action === "settlement-token")
    return {
      chainId,
      name: "MorrowTestToken",
      args: [
        action === "source-token" ? "Morrow Source Test Token" : "Morrow Settlement Test Token",
        action === "source-token" ? "mSRC" : "mSET",
        6,
        1000000000000n,
      ],
    };
  if (action === "vault")
    return { chainId, name: "FundedPaymentVault", args: [await custodyAddress("source-token")] };
  return {
    chainId,
    name: "MorrowMarket",
    args: [
      await custodyAddress("settlement-token"),
      await custodyAddress("vault"),
      await custodyAddress("source-token"),
      payer,
      50,
    ],
  };
}
