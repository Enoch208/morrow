import type { CampaignLedger, LedgerClaim } from "@/lib/evidence/claim-ledger";
import { utcTime } from "@/lib/format/display";
import { landingImages } from "../../landing/landing-images";
import { PageHeading } from "../page-heading";
import { ClaimFeatureCard } from "./claim-feature-card";
import { ClaimPhotoCard } from "./claim-photo-card";
import { MarketCard } from "./market-card";
import { PositionTeaser } from "./position-teaser";

function claimFor(ledger: CampaignLedger, prefix: LedgerClaim["prefix"]): LedgerClaim | undefined {
  return ledger.claims.find((claim) => claim.prefix === prefix);
}

export function OverviewSection({ ledger }: { ledger: CampaignLedger }) {
  const claimA = claimFor(ledger, "a");
  const gate = claimFor(ledger, "gate");
  const claimB = claimFor(ledger, "b");

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
        {claimA && <ClaimFeatureCard claim={claimA} image={landingImages.hero} />}
        {gate && (
          <ClaimPhotoCard
            claim={gate}
            image={landingImages.bentoCancelled}
            headline="Cancelled and fully refunded"
          />
        )}
        {claimB && (
          <ClaimPhotoCard
            claim={claimB}
            image={landingImages.bentoOldRound}
            headline="Deadline passed, buyer refunded"
          />
        )}
        <PositionTeaser />
        <MarketCard image={landingImages.galleryProof} side="escrow" />
        <MarketCard image={landingImages.cardEscrow} side="vault" />
      </div>
    </section>
  );
}
