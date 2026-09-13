import type { ActorRole } from "@/lib/chain/deployments";

export const actorRoleCopy: Readonly<Record<ActorRole, { name: string; duty: string }>> = {
  payer: { name: "Payer / Treasury", duty: "Funds claims, receives the protocol fee" },
  seller: { name: "Seller / Recipient", duty: "Reserves and assigns, receives seller net" },
  buyer: { name: "Liquidity buyer", duty: "Funds escrow, receives refunds and redemptions" },
};
