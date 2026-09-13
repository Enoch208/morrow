"use client";

import type { SaleTerms } from "@morrow/protocol";
import { transactionUrl } from "@/lib/explorers";
import { shortHex } from "@/lib/format/display";
import { preflightChecks } from "./preflight-checks";
import { PreflightResult } from "./preflight-result";
import { useSellerAssignment, type AssignmentState } from "./use-seller-assignment";

function busyLabel(state: AssignmentState): string | undefined {
  if (state.phase === "checking") return "Running preflight…";
  if (state.phase === "signing") return "Confirm assignSale in your wallet…";
  return undefined;
}

export function SellerPreflightCard({
  terms,
  fundingHash,
  saleId,
}: {
  terms: SaleTerms;
  fundingHash: string;
  saleId: string;
}) {
  const { state, isSeller, inspect, assign } = useSellerAssignment(terms, fundingHash, saleId);
  const busy = busyLabel(state);
  const outcome =
    state.phase === "checked" || state.phase === "signing" ? state.outcome : undefined;
  const canSign = isSeller && outcome?.kind === "passed" && state.phase === "checked";

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h3 className="text-base font-medium text-white">Seller preflight</h3>
          <p className="text-xs text-neutral-500">
            The source chain cannot see Creditcoin, so the seller&apos;s client must prove the
            buyer&apos;s money is locked before it asks for a signature. This runs the same checks,
            live, from your browser.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void inspect()}
            disabled={busy !== undefined}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-60"
          >
            {busy ?? "Run preflight · read-only"}
          </button>
          <button
            type="button"
            onClick={() => void assign()}
            disabled={!canSign}
            title={isSeller ? "Run the preflight first" : "Only the seller's wallet can assign"}
            className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
          >
            Sign assignment as seller
          </button>
        </div>
      </div>

      <ol className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {preflightChecks.map((check, index) => (
          <li
            key={check}
            className="flex gap-3 rounded-lg border border-white/5 px-3 py-2 text-[11px] text-neutral-400"
          >
            <span className="font-mono text-neutral-600">{String(index + 1).padStart(2, "0")}</span>
            {check}
          </li>
        ))}
      </ol>

      {outcome && <PreflightResult outcome={outcome} />}
      {state.phase === "assigned" && (
        <a
          href={transactionUrl("sepolia", state.hash)}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-green-500 hover:underline"
        >
          Assigned on source and re-read as ASSIGNED · {shortHex(state.hash)}
        </a>
      )}
      {state.phase === "failed" && (
        <span className="font-mono text-xs text-[#FF5A36]">{state.reason}</span>
      )}
      <span className="font-mono text-[10px] text-neutral-600">
        Read-only mode runs as seller {shortHex(terms.seller)} and signs nothing. Signing is enabled
        only for that wallet, after a fresh preflight passes.
      </span>
    </section>
  );
}
