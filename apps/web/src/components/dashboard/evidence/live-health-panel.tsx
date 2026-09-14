"use client";

import { useEffect, useState } from "react";
import { verifyHealth } from "@morrow/reference/health";
import type { HealthProofCase } from "@morrow/reference/health-proof-inputs";

type Report = Awaited<ReturnType<typeof verifyHealth>>;
type State =
  { readonly status: "checking" } | { readonly status: "ready"; readonly report: Report };

function CheckedAgo({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const seconds = Math.max(0, Math.floor((now - Date.parse(at)) / 1000));
  return (
    <time dateTime={at} title={at}>
      Checked {seconds.toString()} seconds ago{seconds > 180 ? " · refresh recommended" : ""}
    </time>
  );
}

const statusColor = {
  PASS: "text-green-500",
  FAIL: "text-[#FF5A36]",
  UNVERIFIED: "text-amber-300",
} as const;

function HealthResults({ report }: { report: Report }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs" role="status">
        {(["PASS", "FAIL", "UNVERIFIED"] as const).map((status) => (
          <span key={status} className={statusColor[status]}>
            {report.counts[status]} {status}
          </span>
        ))}
        <span className="text-neutral-500">
          <CheckedAgo at={report.checkedAt} />
        </span>
      </div>
      <p className="text-xs text-neutral-400">
        {report.scope} Current calls and historical replays are labelled separately below.
      </p>
      <details className="rounded-xl border border-white/10" open>
        <summary className="cursor-pointer px-4 py-3 text-xs text-neutral-200">
          Inspect all {report.checks.length} checks · verdict: {report.verdict}
        </summary>
        <ul className="divide-y divide-white/5 border-t border-white/5">
          {report.checks.map((check) => (
            <li key={check.id} className="px-4 py-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span className={`font-mono ${statusColor[check.status]}`}>{check.status}</span>
                <span className="min-w-0 break-all text-neutral-200">{check.name}</span>
              </div>
              <p className="mt-1 break-all font-mono text-[10px] leading-relaxed text-neutral-500">
                {check.detail}
              </p>
              <p className="mt-1 font-mono text-[10px] text-neutral-400">
                {check.evidenceKind} · <time dateTime={check.checkedAt}>{check.checkedAt}</time>
              </p>
            </li>
          ))}
        </ul>
      </details>
      <p className="break-all font-mono text-[10px] text-neutral-500">
        Sepolia: {report.endpoints.source ?? "unavailable"}
        <br />
        CC3: {report.endpoints.destination ?? "unavailable"}
      </p>
    </>
  );
}

export function LiveHealthPanel({ proofs }: { proofs: readonly HealthProofCase[] }) {
  const [state, setState] = useState<State>({ status: "checking" });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 95000);
    const run = async () => {
      try {
        const report = await verifyHealth(proofs, (input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([controller.signal, ...(init?.signal ? [init.signal] : [])]),
          }),
        );
        if (active) setState({ status: "ready", report });
      } catch {
        const report = await verifyHealth([], () =>
          Promise.reject(new Error("Live check unavailable")),
        );
        if (active) setState({ status: "ready", report });
      } finally {
        clearTimeout(timeout);
      }
    };
    void run();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [proofs, version]);

  return (
    <section
      aria-label="Live verification health"
      aria-busy={state.status === "checking"}
      className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 lg:p-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="max-w-2xl">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-[#FF5A36]">
            Independent live checks · no wallet required
          </p>
          <h2 className="text-xl font-medium text-white">Check the chains. Not a screenshot.</h2>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            This browser queries public RPCs for pinned runtime hashes, contract surfaces, balances
            and proof refusals. No transaction is signed. A failed read stays UNVERIFIED; archived
            green results are never substituted.
          </p>
        </div>
        <button
          type="button"
          disabled={state.status === "checking"}
          onClick={() => {
            setState({ status: "checking" });
            setVersion((value) => value + 1);
          }}
          className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-xs text-white transition-colors hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-50"
        >
          {state.status === "checking" ? "Checking public chains…" : "Refresh live checks"}
        </button>
      </div>
      {state.status === "ready" ? (
        <HealthResults report={state.report} />
      ) : (
        <p className="text-xs text-neutral-500" role="status">
          Live results pending. Previous results cleared; no cached verdict is shown.
        </p>
      )}
      <p className="text-[11px] leading-relaxed text-neutral-500">
        Sepolia has two independently probed RPC endpoints. CC3 currently has one verified public
        endpoint; a CC3 outage remains visible. The archived 26-check submission report below is a
        different, broader verification scope.
      </p>
    </section>
  );
}
