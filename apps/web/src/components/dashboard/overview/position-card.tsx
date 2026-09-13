"use client";

import { stateLanguage } from "@morrow/protocol";
import { useEffect, useState } from "react";
import { actors, rolesFor } from "@/lib/chain/deployments";
import { readCredits } from "@/lib/chain/live-reads";
import { transactionUrl } from "@/lib/explorers";
import { shortHex } from "@/lib/format/display";
import { formatUnits } from "@/lib/format/token-units";
import { errorMessage } from "@/lib/wallet/eip1193";
import { useLiveChain } from "../live/live-chain-provider";
import { useWallet } from "../wallet/wallet-provider";
import { useWithdrawal, type WithdrawalState } from "./use-withdrawal";

type CreditsRead =
  | { readonly status: "idle" | "loading" }
  | { readonly status: "ready"; readonly address: string; readonly credits: bigint }
  | { readonly status: "unverifiable"; readonly reason: string };

function withdrawalNote(state: WithdrawalState) {
  switch (state.phase) {
    case "idle":
      return null;
    case "signing":
      return <span className="text-neutral-400">Confirm the withdrawal in your wallet…</span>;
    case "verifying":
      return <span className="text-neutral-400">Mined. Re-reading credits on CC3…</span>;
    case "withdrawn":
      return (
        <a
          href={transactionUrl("cc3", state.hash)}
          target="_blank"
          rel="noreferrer"
          className="text-green-500 hover:underline"
        >
          Withdrawn and verified · {shortHex(state.hash)}
        </a>
      );
    case "failed":
      return <span className="text-[#FF5A36]">{state.reason}</span>;
  }
}

export function PositionCard() {
  const wallet = useWallet();
  const { state: chain, refresh } = useLiveChain();
  const [credits, setCredits] = useState<CreditsRead>({ status: "idle" });
  const { state: withdrawal, withdraw } = useWithdrawal(refresh);
  const address = wallet.status === "connected" ? wallet.address : undefined;
  const market = chain.status === "ready" ? chain.market : undefined;

  useEffect(() => {
    if (!address || !market) {
      return;
    }
    let active = true;
    readCredits(address, market).then(
      (value) => {
        if (active) setCredits({ status: "ready", address, credits: value });
      },
      (caught: unknown) => {
        if (active) setCredits({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [address, market]);

  const roles = address ? rolesFor(address) : [];
  const claimable =
    credits.status === "ready" && credits.address === address ? credits.credits : undefined;
  const busy = withdrawal.phase === "signing" || withdrawal.phase === "verifying";
  const canWithdraw = claimable !== undefined && claimable > 0n && !busy;

  const headline = !address
    ? "Connect a wallet to see its position"
    : roles.length > 0
      ? `Connected as ${roles.join(" and ")}`
      : "Observer wallet";
  const detail = !address
    ? `Seller ${shortHex(actors.seller)} and buyer ${shortHex(actors.buyer)} hold the campaign roles. Withdrawals always pay the calling wallet.`
    : claimable === undefined
      ? credits.status === "unverifiable"
        ? credits.reason
        : "Reading claimable credits on CC3…"
      : claimable > 0n
        ? `${formatUnits(claimable, 6)} mSET claimable. Withdraw pays this wallet only.`
        : `No claimable credits. Completed withdrawals show as ${stateLanguage.SELLER_PAID} or ${stateLanguage.REFUND_WITHDRAWN} in each claim timeline.`;

  return (
    <div className="relative z-10 p-6 lg:p-8 flex flex-col justify-center h-full max-w-full md:max-w-[70%] gap-3">
      <span className="inline-block px-2 py-1 rounded bg-[#FF5A36]/10 text-[#FF5A36] text-[10px] font-semibold tracking-wider uppercase w-fit border border-[#FF5A36]/30">
        Your position
      </span>
      <h3 className="text-2xl font-medium text-white">{headline}</h3>
      <p className="text-sm text-neutral-400 font-light">{detail}</p>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {!address ? (
          <button
            type="button"
            onClick={() => void wallet.connect()}
            disabled={wallet.status !== "disconnected"}
            className="rounded-full bg-white px-5 py-2 font-medium text-black hover:bg-neutral-200 disabled:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {wallet.status === "unavailable" ? "No browser wallet detected" : "Connect wallet"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void withdraw()}
            disabled={!canWithdraw}
            title={canWithdraw ? undefined : "Nothing claimable for this wallet"}
            className="rounded-full bg-white px-5 py-2 font-medium text-black hover:bg-neutral-200 disabled:bg-white/10 disabled:text-neutral-500 disabled:cursor-not-allowed"
          >
            {busy ? "Withdrawing…" : "Withdraw credits"}
          </button>
        )}
        {withdrawalNote(withdrawal)}
      </div>
    </div>
  );
}
