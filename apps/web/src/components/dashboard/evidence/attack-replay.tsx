"use client";

import { useState } from "react";
import { replayCall, type ReplayOutcome } from "@/lib/chain/replay";
import type { ReplaySpec } from "@/lib/evidence/campaign-checks";
import { chains } from "@/lib/explorers";

type RunState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "done"; readonly outcome: ReplayOutcome };

function OutcomeLine({ outcome, expected }: { outcome: ReplayOutcome; expected: string }) {
  if (outcome.kind === "unverifiable") {
    return <span className="text-neutral-400">Unverifiable · {outcome.reason}</span>;
  }
  const where = `block ${outcome.block.toLocaleString("en-US")}`;
  if (outcome.kind === "accepted") {
    return (
      <span className="text-[#FF5A36]">
        Accepted at {where}. This contradicts the recorded result.
      </span>
    );
  }
  const matches = outcome.error === expected;
  const agedOut = outcome.error.startsWith("Continuity proof");
  return (
    <span className="flex flex-col gap-1">
      <span className={matches ? "text-green-500" : "text-neutral-300"}>
        Rejected at {where} · {outcome.error}
        {matches ? " · matches the recorded result" : ""}
      </span>
      {agedOut && (
        <span className="font-sans text-neutral-500">
          The archived proof has aged out of the current attestation window, so the native verifier
          now refuses it before Morrow&apos;s sale check runs. The recorded-block replay above is
          the evidence for the sale binding.
        </span>
      )}
    </span>
  );
}

function ReplayButton({
  label,
  evidenceLabel,
  run,
  state,
  expected,
}: {
  label: string;
  evidenceLabel: string;
  run: () => void;
  state: RunState;
  expected: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={run}
        disabled={state.status === "running"}
        className="w-fit rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white hover:text-black disabled:cursor-wait disabled:opacity-60"
      >
        {state.status === "running" ? "Calling chain…" : label}
      </button>
      <span className="font-mono text-[10px] text-neutral-600">
        {evidenceLabel} · read-only eth_call, no wallet
      </span>
      {state.status === "done" && (
        <span className="font-mono text-[11px]">
          <OutcomeLine outcome={state.outcome} expected={expected} />
        </span>
      )}
    </div>
  );
}

export function AttackReplay({ replay, expected }: { replay: ReplaySpec; expected: string }) {
  const [recorded, setRecorded] = useState<RunState>({ status: "idle" });
  const [latest, setLatest] = useState<RunState>({ status: "idle" });
  const chainLabel = chains[replay.chain].name;

  const runAt = (blockTag: number | "latest", setState: (state: RunState) => void) => {
    setState({ status: "running" });
    void replayCall(replay.chain, replay.to, replay.data, blockTag).then((outcome) => {
      setState({ status: "done", outcome });
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        Run it yourself on {chainLabel}
      </span>
      <ReplayButton
        label={`Replay at recorded block ${replay.recordedBlock.toLocaleString("en-US")}`}
        evidenceLabel="historical-replay"
        run={() => {
          runAt(replay.recordedBlock, setRecorded);
        }}
        state={recorded}
        expected={expected}
      />
      <ReplayButton
        label="Run against the latest block"
        evidenceLabel="live-read-verified"
        run={() => {
          runAt("latest", setLatest);
        }}
        state={latest}
        expected={expected}
      />
    </div>
  );
}
