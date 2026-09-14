"use client";

import {
  faucetContracts,
  prepareBrowserFaucetDrip,
  readTokenBalances,
  type FaucetSide,
} from "@morrow/sdk/browser";
import { useCallback, useEffect, useState } from "react";
import { addressUrl } from "@/lib/explorers";
import { formatUnits } from "@/lib/format/token-units";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { errorMessage } from "@/lib/wallet/eip1193";
import { useWallet } from "../wallet/wallet-provider";
import { ActionButton, ActionStatus } from "./action-status";
import { sourceTokenSymbol, settlementTokenSymbol, tradeOptions } from "./trade-config";
import { isBusy, useWalletAction } from "./use-wallet-action";

type Balances =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly address: string;
      readonly sourceRaw: bigint;
      readonly settlementRaw: bigint;
    }
  | { readonly status: "unverifiable"; readonly reason: string };

function FaucetButton({ side, onSettled }: { side: FaucetSide; onSettled: () => void }) {
  const chain = side === "source" ? "sepolia" : "cc3";
  const { state, run } = useWalletAction(chain, onSettled);
  const symbol = side === "source" ? sourceTokenSymbol : settlementTokenSymbol;
  return (
    <div className="flex flex-col gap-1">
      <ActionButton
        label={`Get 20,000 ${symbol}`}
        disabled={isBusy(state)}
        onClick={() =>
          void run((actor, chainId) => prepareBrowserFaucetDrip(side, actor, chainId, tradeOptions))
        }
      />
      <ActionStatus state={state} chain={chain} />
    </div>
  );
}

export function FundsCard({ onChange }: { onChange: () => void }) {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : undefined;
  const [balances, setBalances] = useState<Balances>({ status: "idle" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!address) return;
    let active = true;
    readTokenBalances(address, tradeOptions).then(
      (value) => {
        if (active) setBalances({ status: "ready", address, ...value });
      },
      (caught: unknown) => {
        if (active) setBalances({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [address, version]);

  const settled = useCallback(() => {
    setVersion((value) => value + 1);
    onChange();
  }, [onChange]);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-white">Test funds</h3>
        <p className="max-w-2xl text-xs text-neutral-500">
          Testnet tokens with no monetary value. The payer needs {sourceTokenSymbol} on Sepolia, the
          buyer needs {settlementTokenSymbol} on Creditcoin. Gas is separate: Sepolia ETH and tCTC
          come from public faucets. Each faucet contract gives one drip per address per 24 hours.
        </p>
      </div>
      {!address ? (
        <p className="text-xs text-neutral-400">Connect a wallet to read its balances.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(["source", "settlement"] as const).map((side) => (
            <div key={side} className="flex flex-col gap-3 rounded-xl border border-white/5 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-neutral-500">
                  {side === "source"
                    ? `${sourceTokenSymbol} · Sepolia`
                    : `${settlementTokenSymbol} · CC3`}
                </span>
                <a
                  href={addressUrl(
                    side === "source" ? "sepolia" : "cc3",
                    faucetContracts[side].address,
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-neutral-600 hover:text-white"
                >
                  Faucet contract
                </a>
              </div>
              <span className="font-mono text-lg text-white">
                {balances.status === "ready" && balances.address === address
                  ? formatUnits(
                      side === "source" ? balances.sourceRaw : balances.settlementRaw,
                      testTokenDecimals,
                    )
                  : balances.status === "unverifiable"
                    ? "Unverifiable"
                    : "…"}
              </span>
              <FaucetButton side={side} onSettled={settled} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
