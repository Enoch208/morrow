import type { Metadata } from "next";
import { ActorCredits } from "@/components/dashboard/position/actor-credits";
import { MarketCard } from "@/components/dashboard/overview/market-card";
import { PositionBanner } from "@/components/dashboard/overview/position-banner";
import { PageHeading } from "@/components/dashboard/page-heading";
import { landingImages } from "@/components/landing/landing-images";

export const metadata: Metadata = { title: "Your position" };

export default function PositionPage() {
  return (
    <section>
      <PageHeading
        title="Your position"
        description="Your wallet's role, what it can withdraw, and every campaign actor's credits read live on Creditcoin."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-8">
        <PositionBanner />
        <MarketCard image={landingImages.galleryProof} side="escrow" />
        <MarketCard image={landingImages.cardEscrow} side="vault" />
      </div>
      <ActorCredits />
    </section>
  );
}
