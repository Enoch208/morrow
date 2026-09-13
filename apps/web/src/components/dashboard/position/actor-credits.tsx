"use client";

import { useEffect, useState } from "react";
import { actors, type ActorRole } from "@/lib/chain/deployments";
import { readCredits } from "@/lib/chain/live-reads";
import { addressUrl } from "@/lib/explorers";
import { shortHex } from "@/lib/format/display";
import { formatUnits } from "@/lib/format/token-units";
import { errorMessage } from "@/lib/wallet/eip1193";
import { useLiveChain } from "../live/live-chain-provider";

type CreditsByRole =
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly block: number;
      readonly values: Readonly<Record<ActorRole, bigint>>;
    }
  | { readonly status: "unverifiable"; readonly reason: string };

const roleCopy: Readonly<Record<ActorRole, { name: string; duty: string }>> = {
  payer: { name: "Payer / Treasury", duty: "Funds claims, receives the protocol fee" },
  seller: { name: "Seller / Recipient", duty: "Reserves and assigns, receives seller net" },
  buyer: { name: "Liquidity buyer", duty: "Funds escrow, receives refunds and redemptions" },
};

const roles = Object.keys(actors) as ActorRole[];

export function ActorCredits() {
  const { state } = useLiveChain();
  const [credits, setCredits] = useState<CreditsByRole>({ status: "loading" });
  const market = state.status === "ready" ? state.market : undefined;

  useEffect(() => {
    if (!market) {
      return;
    }
    let active = true;
    Promise.all(roles.map((role) => readCredits(actors[role], market))).then(
      (values) => {
        if (active) {
          setCredits({
            status: "ready",
            block: market.destinationBlock,
            values: { payer: values[0] ?? 0n, seller: values[1] ?? 0n, buyer: values[2] ?? 0n },
          });
        }
      },
      (caught: unknown) => {
        if (active) setCredits({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [market]);

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:justify-between mb-5">
        <h3 className="text-base font-medium text-white">Campaign actors</h3>
        <span className="font-mono text-[11px] text-neutral-500">
          {credits.status === "ready"
            ? `Credits at CC3 block ${credits.block.toLocaleString("en-US")}`
            : credits.status === "loading"
              ? "Reading chain…"
              : `Unverifiable · ${credits.reason}`}
        </span>
      </div>
      <ul className="flex flex-col divide-y divide-white/5">
        {roles.map((role) => (
          <li
            key={role}
            className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-white">{roleCopy[role].name}</span>
              <span className="text-[11px] text-neutral-500">{roleCopy[role].duty}</span>
            </div>
            <div className="flex items-center gap-6">
              <a
                href={addressUrl("cc3", actors[role])}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-xs text-neutral-400 hover:text-[#FF5A36] transition-colors"
              >
                {shortHex(actors[role])}
              </a>
              <span className="font-mono text-xs text-white min-w-[90px] text-right">
                {credits.status === "ready" ? `${formatUnits(credits.values[role], 6)} mSET` : "—"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
