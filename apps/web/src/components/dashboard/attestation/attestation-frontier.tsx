"use client";

import { useEffect, useState } from "react";
import { readAttestationFrontier, type AttestationFrontier } from "@/lib/chain/attestation";
import { errorMessage } from "@/lib/wallet/eip1193";

type FrontierState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly frontier: AttestationFrontier; readonly readAt: string }
  | { readonly status: "unverifiable"; readonly reason: string };

const sepoliaBlockSeconds = 12n;

function Figure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</span>
      <span className="font-mono text-lg text-white">{value}</span>
      <span className="font-mono text-[10px] text-neutral-600">{hint}</span>
    </div>
  );
}

export function AttestationFrontierPanel() {
  const [state, setState] = useState<FrontierState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    readAttestationFrontier().then(
      (frontier) => {
        if (active) setState({ status: "ready", frontier, readAt: new Date().toISOString() });
      },
      (caught: unknown) => {
        if (active) setState({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [version]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium text-white">Attestation frontier · live</h3>
          <p className="text-xs text-neutral-500">
            How far Creditcoin has attested Sepolia, read from the ChainInfo precompile at 0x…0FD3.
            A source event can only be proven once its block is at or below this height.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setVersion((current) => current + 1);
          }}
          className="w-fit shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white hover:text-black"
        >
          Read again
        </button>
      </div>
      {state.status === "ready" ? (
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <Figure
            label="Latest attested"
            value={state.frontier.attestedHeight.toLocaleString("en-US")}
            hint="Sepolia block"
          />
          <Figure
            label="Sepolia head"
            value={state.frontier.sourceHead.toLocaleString("en-US")}
            hint="public RPC"
          />
          <Figure
            label="Attestation lag"
            value={`${state.frontier.lagBlocks.toString()} blocks`}
            hint={`≈ ${((state.frontier.lagBlocks * sepoliaBlockSeconds) / 60n).toString()} min at 12s blocks`}
          />
          <Figure
            label="Latest checkpoint"
            value={state.frontier.checkpointHeight.toLocaleString("en-US")}
            hint={`read at CC3 block ${state.frontier.readAtCc3Block.toLocaleString("en-US")}`}
          />
        </div>
      ) : (
        <p className="font-mono text-xs text-neutral-500">
          {state.status === "loading" ? "Reading ChainInfo…" : `Unverifiable · ${state.reason}`}
        </p>
      )}
    </div>
  );
}
