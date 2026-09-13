import { stateLanguage } from "@morrow/protocol";
import type { ChainKey } from "@/lib/explorers";

export interface MilestoneLabel {
  readonly label: string;
  readonly chain: ChainKey | undefined;
}

const labels: Readonly<Record<string, MilestoneLabel>> = {
  "create:claim-verified": { label: "Payout funded in vault", chain: "sepolia" },
  "reserve:reservation-verified": { label: stateLanguage.SOURCE_RESERVED, chain: "sepolia" },
  "reserve-wait:attestation-observed": { label: "Reservation attested", chain: undefined },
  "reserve-proof:native-verified": { label: "Reservation proof verified", chain: undefined },
  "fund:bound-verified": { label: stateLanguage.DESTINATION_FUNDED, chain: "cc3" },
  "assign:assignment-verified": { label: stateLanguage.ASSIGNED_ON_SOURCE, chain: "sepolia" },
  "assign-wait:attestation-observed": { label: "Assignment attested", chain: undefined },
  "assign-proof:native-verified": { label: "Assignment proof verified", chain: undefined },
  "assign-archive:archived": { label: "Assignment proof held back", chain: undefined },
  "deadline-check:delay-safety-verified": {
    label: "Late cancel refused on source",
    chain: undefined,
  },
  "cancel:cancellation-verified": { label: "Cancelled on source", chain: "sepolia" },
  "cancel-proof:native-verified": { label: "Cancellation proof verified", chain: undefined },
  "settle:outcome-verified": { label: stateLanguage.SELLER_FUNDS_CLAIMABLE, chain: "cc3" },
  "refund:outcome-verified": { label: stateLanguage.REFUND_CLAIMABLE, chain: "cc3" },
  "redeem:redemption-verified": { label: "Redeemed at maturity", chain: "sepolia" },
};

const withdrawalLabels: Readonly<Record<string, string>> = {
  SELLER: stateLanguage.SELLER_PAID,
  BUYER: stateLanguage.REFUND_WITHDRAWN,
  PAYER: "Protocol fee withdrawn",
};

export function milestoneLabel(
  suffix: string,
  state: string,
  role: string | undefined,
): MilestoneLabel | undefined {
  if (state === "withdrawal-verified") {
    const label = role ? withdrawalLabels[role] : undefined;
    return label ? { label, chain: "cc3" } : undefined;
  }
  return labels[`${suffix}:${state}`];
}
