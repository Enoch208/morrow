import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { PrecisionFeatures } from "./precision-features";
import { PrecisionGallery } from "./precision-gallery";
import { PulseDot } from "./pulse-dot";

export function PrecisionDetails({ evidence }: { evidence: ClaimAEvidence }) {
  return (
    <section className="md:mt-28 mt-20 relative scroll-mt-32" id="safety">
      <div className="mx-auto max-w-7xl px-6 md:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-red-200 mb-6">
              <PulseDot />
              Trust boundary
            </div>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-4">
              What each chain actually knows
            </h2>
            <p className="leading-relaxed text-neutral-400 max-w-xl">
              Morrow never bridges the locked payout or the purchase capital. Each chain enforces
              its own rules, and Attestcoin carries authenticated evidence of what happened on the
              source.
            </p>

            <PrecisionFeatures />

            <div className="mt-8 flex gap-4">
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition-transform hover:scale-105"
              >
                <span>How it works</span>
                <HugeiconsIcon icon={ArrowRight02Icon} size={16} />
              </a>
            </div>
          </div>

          <PrecisionGallery evidence={evidence} />
        </div>
      </div>
    </section>
  );
}
