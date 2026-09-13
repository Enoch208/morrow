import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge01Icon, LockIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { utcDateTimeFromUnix } from "@/lib/format/display";
import { saleAmounts } from "@/lib/format/sale-amounts";
import { landingImages } from "./landing-images";
import cardProof from "@/assets/landing/card-proof.webp";
import { CoverPhoto } from "./screens/cover-photo";
import { SaleTimelineScreen } from "./screens/sale-timeline-screen";
import { screens } from "./screens/screen-geometry";
import { ScreenSurface } from "./screens/screen-surface";
import { ShowcaseCard } from "./showcase-card";

function heroDescription(evidence: ClaimAEvidence): string {
  if (evidence.status === "unavailable") {
    return "The full face value sits in a non-cancellable vault until maturity.";
  }
  const { terms } = evidence.snapshot;
  return `Claim A holds ${saleAmounts(terms).faceValue} mSRC in the Sepolia vault until ${utcDateTimeFromUnix(terms.maturity)}. Its sale settles on Creditcoin by proof.`;
}

export function HeroShowcase({ evidence }: { evidence: ClaimAEvidence }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8 mb-32 relative gap-x-6 gap-y-6">
      <div className="absolute -left-12 top-0 hidden text-[10px] font-mono text-neutral-800 xl:block">
        01
      </div>
      <div className="absolute -right-12 top-0 hidden text-[10px] font-mono text-neutral-800 xl:block">
        02
      </div>

      <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.5s_both] relative lg:col-span-8 md:h-[500px] group overflow-hidden rounded-3xl border border-white/5 bg-[#080808] animate hover:border-white/10 transition-all">
        <div className="relative aspect-[1672/941] md:absolute md:inset-0 md:aspect-auto">
          <CoverPhoto
            image={landingImages.hero}
            sizes="(min-width: 1024px) 66vw, 100vw"
            preload
            focusX={0.9}
            frameClassName=""
            motionClassName="transition-transform duration-700 group-hover:scale-105"
            imageClassName="opacity-90"
          >
            <ScreenSurface geometry={screens.heroMonitor}>
              <SaleTimelineScreen evidence={evidence} />
            </ScreenSurface>
          </CoverPhoto>
        </div>
        <div className="hidden md:block bg-gradient-to-t from-black via-black/20 to-transparent absolute top-0 right-0 bottom-0 left-0 pointer-events-none" />

        <div className="relative p-6 md:absolute md:bottom-0 md:left-0 md:p-8 w-full">
          <div className="flex items-center gap-2 text-red-500 mb-2">
            <HugeiconsIcon icon={LockIcon} size={16} />
            <span className="text-xs font-semibold uppercase tracking-widest">
              Source chain · live testnet
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-normal tracking-tight text-white mb-2">
            The payout stays locked
          </h3>
          <p className="text-neutral-400 text-sm max-w-md">{heroDescription(evidence)}</p>
        </div>
      </div>

      <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.6s_both] lg:col-span-4 flex flex-col md:flex-row lg:flex-col z-10 animate gap-x-6 gap-y-6">
        <ShowcaseCard
          image={landingImages.cardEscrow}
          icon={Wallet01Icon}
          title="Buyer capital"
          caption="Stays in escrow on Creditcoin"
          href="#economics"
        />
        <ShowcaseCard
          image={cardProof}
          icon={CheckmarkBadge01Icon}
          title="Proof crosses"
          caption="Attestcoin verifies the exact source outcome"
          href="#verify"
        />
      </div>
    </div>
  );
}
