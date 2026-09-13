import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, ShieldCheckIcon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { utcDateTimeFromUnix } from "@/lib/format/display";
import { saleAmounts } from "@/lib/format/sale-amounts";
import { stateLanguage } from "@morrow/protocol";
import { landingImages } from "./landing-images";
import { CoverPhoto } from "./screens/cover-photo";
import { PhoneAmountScreen } from "./screens/phone-amount-screen";
import { screens } from "./screens/screen-geometry";
import { ScreenSurface } from "./screens/screen-surface";

export function LensVisual({ evidence }: { evidence: ClaimAEvidence }) {
  const terms = evidence.status === "available" ? evidence.snapshot.terms : undefined;
  const faceValue = terms ? saleAmounts(terms).faceValue : stateLanguage.EVIDENCE_UNAVAILABLE;
  const maturity = terms ? `until ${utcDateTimeFromUnix(terms.maturity)}` : "";

  return (
    <div className="relative animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.4s_both]">
      <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-[#050505] aspect-[4/5] lg:aspect-square">
        <CoverPhoto
          image={landingImages.lensVerifier}
          sizes="(min-width: 1024px) 45vw, 100vw"
          frameClassName=""
          motionClassName="transition-transform duration-1000 group-hover:scale-110"
          imageClassName="opacity-80"
        >
          <ScreenSurface geometry={screens.verifierPhone}>
            <PhoneAmountScreen eyebrow="In vault" amount={faceValue} unit={`mSRC ${maturity}`} />
          </ScreenSurface>
        </CoverPhoto>
        <div className="absolute inset-0 bg-gradient-to-tr from-black/80 via-transparent to-white/5 pointer-events-none" />

        <div className="absolute top-8 right-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white animate-spin [animation-duration:10s]">
            <HugeiconsIcon icon={Clock01Icon} size={20} />
          </div>
        </div>

        <div className="absolute bottom-8 left-8 right-8">
          <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-5">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500">
                <HugeiconsIcon icon={ShieldCheckIcon} size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium text-white">Funded before it is sold</h4>
                <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                  The vault takes the full face value into custody before a sale can be reserved. A
                  buyer redeems the original payout at maturity.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block absolute -z-10 -top-4 -right-4 w-24 h-24 border-t border-r border-white/10 rounded-tr-3xl" />
      <div className="hidden lg:block absolute -z-10 -bottom-4 -left-4 w-24 h-24 border-b border-l border-white/10 rounded-bl-3xl" />
    </div>
  );
}
