import type { StaticImageData } from "next/image";
import type { CampaignPrefix, ClaimOutcome, LedgerClaim } from "@/lib/evidence/claim-ledger";
import { landingImages } from "../../landing/landing-images";

export const claimImages = {
  gate: landingImages.bentoCancelled,
  a: landingImages.hero,
  b: landingImages.bentoOldRound,
  c: landingImages.thumbClock,
} as const satisfies Record<CampaignPrefix, StaticImageData>;

const settledHeadlines = {
  gate: {
    assignment: "Sold before unlock, settled after maturity",
    cancellation: "Cancelled and fully refunded",
  },
  a: {
    assignment: "Sold before unlock, settled after maturity",
    cancellation: "Deadline passed, buyer refunded",
  },
  b: {
    assignment: "Sold before unlock, settled after maturity",
    cancellation: "Deadline passed, buyer refunded",
  },
  c: {
    assignment: "Round one lapsed, round two sold",
    cancellation: "Both rounds lapsed, buyer refunded",
  },
} as const satisfies Record<CampaignPrefix, Record<ClaimOutcome, string>>;

const progressHeadlines = {
  gate: "Sale in progress",
  a: "Sale in progress",
  b: "Sale in progress",
  c: "Repeat round in progress",
} as const satisfies Record<CampaignPrefix, string>;

export function claimHeadline(claim: LedgerClaim): string {
  return claim.complete
    ? settledHeadlines[claim.prefix][claim.outcome]
    : progressHeadlines[claim.prefix];
}
