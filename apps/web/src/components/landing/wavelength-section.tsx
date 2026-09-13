import { GeistMono } from "geist/font/mono";
import { HugeiconsIcon } from "@hugeicons/react";
import { Coins01Icon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { LensVisual } from "./lens-visual";
import { DiscountChart } from "./discount-chart";
import { saleEconomics } from "@/lib/format/sale-economics";
import { stateLanguage } from "@morrow/protocol";

export function WavelengthSection({ evidence }: { evidence: ClaimAEvidence }) {
  const economics =
    evidence.status === "available" ? saleEconomics(evidence.snapshot.terms) : undefined;
  const unavailable = stateLanguage.EVIDENCE_UNAVAILABLE;
  const metrics = [
    {
      value: economics?.buyerGrossGain ?? unavailable,
      unit: "mSRC",
      label: "Buyer gain at maturity",
    },
    {
      value: economics?.fee ?? unavailable,
      unit: "mSET",
      label: `Fee at ${economics?.feeBps ?? "—"} bps`,
    },
    {
      value: economics?.holdingReturnPercent ?? unavailable,
      unit: "%",
      label: "Holding-period return",
    },
  ];

  return (
    <section
      id="economics"
      className="relative border-t border-white/5 bg-[#020202] py-32 overflow-hidden scroll-mt-32"
    >
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-red-900/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute right-0 bottom-0 translate-x-1/3 translate-y-1/3 w-[500px] h-[500px] bg-white/5 blur-[100px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.2s_both]">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-neutral-300 mb-6">
              <HugeiconsIcon icon={Coins01Icon} size={12} />
              Economics
            </div>

            <h2 className="text-3xl font-medium tracking-tight text-white md:text-5xl mb-6">
              Bought at a discount, <span className="text-neutral-500">redeemed at face.</span>
            </h2>

            <p className="leading-relaxed font-light text-neutral-400 max-w-lg mb-8">
              The buyer pays less than face value today and redeems the full payout at maturity.
              Gross price, protocol fee and seller net are disclosed separately, computed in integer
              token units. Not a yield promise.
            </p>

            <div className="relative w-full rounded-2xl border border-white/10 bg-[#080808] p-6 mb-8 shadow-2xl">
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center mb-6">
                <div>
                  <div className="text-xs font-semibold text-white">Return by purchase price</div>
                  <div className="text-[10px] text-neutral-500 font-mono">
                    Claim A · face value {economics?.faceValue ?? unavailable} mSRC
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-[10px] text-neutral-400">Holding-period return</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-neutral-700" />
                    <span className="text-[10px] text-neutral-400">Discount to face</span>
                  </div>
                </div>
              </div>
              <div className="h-[250px] w-full">
                {economics ? (
                  <DiscountChart
                    fontFamily={GeistMono.style.fontFamily}
                    points={economics.points}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-500">
                    {unavailable}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-6">
              {metrics.map(({ value, unit, label }) => (
                <div key={label}>
                  <div className="text-2xl font-medium text-white tracking-tight">
                    {value}
                    <span className="text-sm text-neutral-500 ml-1">{unit}</span>
                  </div>
                  <div className="text-[10px] text-neutral-500 uppercase tracking-widest mt-1">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <LensVisual evidence={evidence} />
        </div>
      </div>
    </section>
  );
}
