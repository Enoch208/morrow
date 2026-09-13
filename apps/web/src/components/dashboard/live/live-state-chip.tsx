"use client";

import { destinationStateLabels, sourceStateLabels } from "@/lib/chain/state-language";
import { useLiveChain } from "./live-chain-provider";

export function LiveStateChips({
  prefix,
  tone = "dark",
}: {
  prefix: string;
  tone?: "dark" | "photo";
}) {
  const { state } = useLiveChain();
  const base =
    tone === "photo"
      ? "border-white/20 bg-black/40 backdrop-blur-md"
      : "border-white/10 bg-white/[0.03]";

  if (state.status !== "ready") {
    const label = state.status === "loading" ? "Reading chain…" : "Unverifiable";
    return (
      <span
        className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[10px] text-neutral-400 ${base}`}
      >
        {label}
      </span>
    );
  }
  const claim = state.claims[prefix];
  if (!claim) {
    return null;
  }
  return (
    <div className="flex flex-wrap gap-2">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] text-white ${base}`}
      >
        <span className="font-mono text-neutral-500">Sepolia</span>
        {sourceStateLabels[claim.roundState]}
      </span>
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] text-white ${base}`}
      >
        <span className="font-mono text-neutral-500">CC3</span>
        {destinationStateLabels[claim.saleState]}
      </span>
      {claim.redeemed && (
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] text-green-500 ${base}`}
        >
          Redeemed
        </span>
      )}
    </div>
  );
}
