"use client";

import type { StaticImageData } from "next/image";
import { formatUnits } from "@/lib/format/token-units";
import { CoverPhoto } from "../../landing/screens/cover-photo";
import { useLiveChain } from "../live/live-chain-provider";

export function MarketCard({ image, side }: { image: StaticImageData; side: "escrow" | "vault" }) {
  const { state } = useLiveChain();
  const rows =
    state.status !== "ready"
      ? []
      : side === "escrow"
        ? [
            { label: "Bound principal", value: state.market.totalBound },
            { label: "Unwithdrawn credits", value: state.market.totalCredits },
            { label: "Total liabilities", value: state.market.totalLiabilities },
          ]
        : [{ label: "Unredeemed backing", value: state.market.totalBacking }];
  const unit = side === "escrow" ? "mSET" : "mSRC";
  const block =
    state.status === "ready"
      ? side === "escrow"
        ? `CC3 block ${state.market.destinationBlock.toLocaleString("en-US")}`
        : `Sepolia block ${state.market.sourceBlock.toLocaleString("en-US")}`
      : state.status === "loading"
        ? "Reading chain…"
        : "Unverifiable";

  return (
    <div className="h-[340px] relative rounded-2xl overflow-hidden group border border-white/5">
      <CoverPhoto
        image={image}
        sizes="(min-width: 1024px) 25vw, 100vw"
        frameClassName=""
        motionClassName="transition-transform duration-700 group-hover:scale-105"
        imageClassName="opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
      <div className="relative z-20 p-5 flex flex-col justify-end h-full gap-3">
        <div>
          <h4 className="text-base font-medium text-white">
            {side === "escrow" ? "Creditcoin escrow" : "Sepolia vault"}
          </h4>
          <span className="font-mono text-[10px] text-neutral-500">{block}</span>
        </div>
        <dl className="flex flex-col gap-1.5">
          {rows.map(({ label, value }) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-neutral-400">{label}</dt>
              <dd className="font-mono text-xs text-white">
                {formatUnits(value, 6)} {unit}
              </dd>
            </div>
          ))}
          {state.status === "unverifiable" && (
            <dd className="text-xs text-[#FF5A36]">{state.reason}</dd>
          )}
        </dl>
      </div>
    </div>
  );
}
