import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { HeroFigures } from "./hero-figures";
import { PulseDot } from "./pulse-dot";

export function Hero({ evidence }: { evidence: ClaimAEvidence }) {
  return (
    <div className="mx-auto mb-24 max-w-4xl text-center">
      <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.1s_both] mb-8 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-950/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-red-200 shadow-[0_0_15px_rgba(204,0,0,0.15)] animate">
        <PulseDot />
        Secondary liquidity for time-locked payouts
      </div>

      <h1 className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.2s_both] mb-6 text-5xl font-medium leading-[0.95] tracking-tight text-white md:text-7xl md:leading-none animate">
        Sell a locked payout
        <br />
        <span className="text-neutral-500">before it unlocks.</span>
      </h1>

      <p className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.3s_both] mx-auto mb-10 max-w-xl text-lg font-light leading-relaxed text-neutral-400 tracking-tight animate">
        A payer has already funded your future payout. A buyer pays you early on Creditcoin. The
        locked payout stays on its source chain; only proof of its sale crosses through Attestcoin.
      </p>

      <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.4s_both] flex flex-col items-center justify-center gap-4 animate">
        <a
          href="#how-it-works"
          className="group relative flex items-center gap-2 rounded-full bg-white text-black px-8 py-3 text-sm font-medium transition-all hover:bg-gray-200"
        >
          <span>See how a sale settles</span>
          <HugeiconsIcon
            icon={ArrowRight02Icon}
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </a>
      </div>

      <HeroFigures evidence={evidence} />
    </div>
  );
}
