import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClaimPhotoCard } from "@/components/dashboard/overview/claim-photo-card";
import { PageHeading } from "@/components/dashboard/page-heading";
import { landingImages } from "@/components/landing/landing-images";
import { loadCampaignLedger, type CampaignPrefix } from "@/lib/evidence/claim-ledger";

export const metadata: Metadata = { title: "Claims" };

const claimImages = {
  gate: landingImages.bentoCancelled,
  a: landingImages.hero,
  b: landingImages.bentoOldRound,
} as const satisfies Record<CampaignPrefix, unknown>;

const headlines = {
  gate: "Cancelled and fully refunded",
  a: "Sold before unlock, settled after maturity",
  b: "Deadline passed, buyer refunded",
} as const satisfies Record<CampaignPrefix, string>;

export default function ClaimsPage() {
  const ledger = loadCampaignLedger();
  if (!ledger) {
    notFound();
  }
  return (
    <section>
      <PageHeading
        title="Claims"
        description="Every funded payout in the campaign. Open a claim for its terms, full evidence timeline and live next steps."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-8">
        {ledger.claims.map((claim) => (
          <ClaimPhotoCard
            key={claim.prefix}
            claim={claim}
            image={claimImages[claim.prefix]}
            headline={headlines[claim.prefix]}
          />
        ))}
      </div>
    </section>
  );
}
