import type { CampaignLedger } from "@/lib/evidence/claim-ledger";
import { utcTime } from "@/lib/format/display";
import { landingImages } from "../../landing/landing-images";
import { claimHeadline, claimImages } from "../claims/claim-presentation";
import { PageHeading } from "../page-heading";
import { ClaimFeatureCard } from "./claim-feature-card";
import { ClaimPhotoCard } from "./claim-photo-card";
import { MarketCard } from "./market-card";
import { PositionTeaser } from "./position-teaser";

export function OverviewSection({ ledger }: { ledger: CampaignLedger }) {
  const featured = ledger.claims.find((claim) => claim.prefix === "a");
  const others = ledger.claims.filter((claim) => claim.prefix !== "a");

  return (
    <section>
      <PageHeading
        title="Live campaign"
        description="Claim state, escrow and vault balances read directly from Sepolia and Creditcoin."
        aside={
          <span className="font-mono text-[11px] text-neutral-500">
            Evidence snapshot {ledger.snapshotAt ? utcTime(ledger.snapshotAt) : "unavailable"}
          </span>
        }
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-8">
        {featured && <ClaimFeatureCard claim={featured} image={claimImages.a} />}
        {others.map((claim) => (
          <ClaimPhotoCard
            key={claim.prefix}
            claim={claim}
            image={claimImages[claim.prefix]}
            headline={claimHeadline(claim)}
          />
        ))}
        <MarketCard image={landingImages.galleryProof} side="escrow" />
        <MarketCard image={landingImages.cardEscrow} side="vault" />
        <PositionTeaser />
      </div>
    </section>
  );
}
