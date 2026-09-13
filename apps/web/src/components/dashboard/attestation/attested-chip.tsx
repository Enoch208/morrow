"use client";

import { useAttested, type AttestedState } from "./use-attested";

const labels: Readonly<Record<AttestedState, string>> = {
  checking: "Checking attestation…",
  attested: "Attested on Creditcoin",
  "not-attested": "Not yet attested",
  unverifiable: "Attestation unverifiable",
};

const tones: Readonly<Record<AttestedState, string>> = {
  checking: "text-neutral-500",
  attested: "text-green-500",
  "not-attested": "text-[#FF5A36]",
  unverifiable: "text-neutral-500",
};

export function AttestedChip({ height }: { height: number }) {
  const state = useAttested(height);
  return (
    <span
      className={`font-mono text-[10px] ${tones[state]}`}
      title={`ChainInfo is_height_attested(1, ${String(height)})`}
    >
      {labels[state]} · block {height.toLocaleString("en-US")}
    </span>
  );
}
