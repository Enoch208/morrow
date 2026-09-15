import type { TradeStep } from "./trade-log.ts";

export const tradeSigner = {
  "drip-buyer": "BUYER",
  "approve-claim": "PAYER",
  create: "PAYER",
  reserve: "SELLER",
  "approve-fund": "BUYER",
  "fund-shallow-refused": "BUYER",
  "verify-front-run": "PAYER",
  fund: "BUYER",
  assign: "SELLER",
  settle: "SELLER",
  "withdraw-seller": "SELLER",
  cancel: "SELLER",
  recognize: "BUYER",
  "withdraw-buyer": "BUYER",
  redeem: "BUYER",
} as const satisfies Record<TradeStep, "PAYER" | "SELLER" | "BUYER">;

export function tradeChain(step: TradeStep): bigint {
  return [
    "drip-buyer",
    "approve-fund",
    "fund-shallow-refused",
    "verify-front-run",
    "fund",
    "settle",
    "withdraw-seller",
    "recognize",
    "withdraw-buyer",
  ].includes(step)
    ? 102031n
    : 11155111n;
}
