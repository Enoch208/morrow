"use client";

import { useEffect, useState } from "react";
import { forbiddenOpcodes } from "@/lib/chain/bytecode";
import {
  isSurfaceSealed,
  readContractSurface,
  type ContractSurface,
} from "@/lib/chain/contract-surface";
import { chains } from "@/lib/explorers";
import { errorMessage } from "@/lib/wallet/eip1193";

type SurfaceState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly surfaces: readonly ContractSurface[] }
  | { readonly status: "unverifiable"; readonly reason: string };

const opcodeList = Object.keys(forbiddenOpcodes).join(", ");

function CheckLine({ passed, children }: { passed: boolean; children: string }) {
  return (
    <li className={`font-mono text-[11px] ${passed ? "text-green-500" : "text-[#FF5A36]"}`}>
      {passed ? "Pass" : "Fail"} · {children}
    </li>
  );
}

function SurfaceCard({ surface }: { surface: ContractSurface }) {
  const dispatched = surface.abiFunctionCount - surface.undispatched.length;
  const forbiddenTotal = Object.values(surface.forbiddenCounts).reduce((sum, n) => sum + n, 0);
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-white">{surface.name}</span>
        <span className="font-mono text-[10px] text-neutral-500">
          {chains[surface.chain].name} · block {surface.block.toLocaleString("en-US")} ·{" "}
          {surface.executableBytes.toLocaleString("en-US")} bytes of code
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-widest text-neutral-500">
          Every state-changing function
        </span>
        <ul className="flex flex-wrap gap-1.5">
          {surface.writeFunctions.map((name) => (
            <li
              key={name}
              className="rounded-md border border-white/10 px-2 py-0.5 font-mono text-[11px] text-neutral-200"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
      <ul className="flex flex-col gap-1">
        <CheckLine passed={surface.undispatched.length === 0 && surface.unlisted.length === 0}>
          {`Dispatcher routes ${dispatched.toString()} of ${surface.abiFunctionCount.toString()} ABI functions, ${surface.unlisted.length.toString()} unlisted`}
        </CheckLine>
        <CheckLine passed={forbiddenTotal === 0}>
          {`${forbiddenTotal.toString()} occurrences of ${opcodeList}`}
        </CheckLine>
      </ul>
    </article>
  );
}

export function WriteSurfacePanel() {
  const [state, setState] = useState<SurfaceState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([readContractSurface("vault"), readContractSurface("market")]).then(
      (surfaces) => {
        if (active) setState({ status: "ready", surfaces });
      },
      (caught: unknown) => {
        if (active) setState({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [version]);

  const sealed = state.status === "ready" && state.surfaces.every(isSurfaceSealed);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h3 className="text-base font-medium text-white">No admin path · live</h3>
          <p className="text-xs text-neutral-500">
            Reads the deployed bytecode of both contracts and checks that each dispatches exactly
            the functions in its published ABI, with no opcode that could upgrade or destroy it.
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
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {state.surfaces.map((surface) => (
              <SurfaceCard key={surface.contract} surface={surface} />
            ))}
          </div>
          <p className={`text-xs ${sealed ? "text-neutral-300" : "text-[#FF5A36]"}`}>
            {sealed
              ? "No owner, pause, upgrade, verifier setter or sweep exists on-chain. Funds move only through the functions listed above."
              : "The deployed code does not match its published ABI. Treat every claim on this page as unverified."}
          </p>
          <span className="font-mono text-[10px] text-neutral-600">
            eth_getCode · linear disassembly in this browser · live-read-verified
          </span>
        </>
      ) : (
        <p className="font-mono text-xs text-neutral-500">
          {state.status === "loading"
            ? "Reading deployed bytecode…"
            : `Unverifiable · ${state.reason}`}
        </p>
      )}
    </div>
  );
}
