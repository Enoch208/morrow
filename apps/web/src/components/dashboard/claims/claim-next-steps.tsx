"use client";

import type { SaleTerms } from "@morrow/protocol";
import { useLiveChain } from "../live/live-chain-provider";
import { nextSteps, type StepStatus } from "./next-steps";

const statusStyles: Readonly<Record<StepStatus, string>> = {
  done: "text-green-500 bg-green-500/10",
  eligible: "text-[#FF5A36] bg-[#FF5A36]/10",
  unavailable: "text-neutral-400 bg-white/[0.04]",
};

const statusLabels: Readonly<Record<StepStatus, string>> = {
  done: "Done",
  eligible: "Eligible",
  unavailable: "Not available",
};

export function ClaimNextSteps({ prefix, terms }: { prefix: string; terms: SaleTerms }) {
  const { state } = useLiveChain();

  if (state.status !== "ready") {
    return (
      <p className="text-xs text-neutral-500">
        {state.status === "loading" ? "Reading live state…" : `Unverifiable · ${state.reason}`}
      </p>
    );
  }
  const claim = state.claims[prefix];
  if (!claim) {
    return <p className="text-xs text-neutral-500">Unverifiable · claim not found on chain</p>;
  }

  return (
    <ul className="flex flex-col divide-y divide-white/5">
      {nextSteps(claim, terms, state.market.sourceTimestamp).map((step) => (
        <li key={step.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-white">{step.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[step.status]}`}
            >
              {statusLabels[step.status]}
            </span>
          </div>
          <span className="text-[11px] text-neutral-500">
            {step.who} · {step.reason}
          </span>
        </li>
      ))}
    </ul>
  );
}
