"use client";

import { useCallback, useState } from "react";
import { useWallet } from "../wallet/wallet-provider";
import { ActivityPanel } from "./activity-panel";
import { CreateClaimCard } from "./create-claim-card";
import { FundsCard } from "./funds-card";

export function TradeWorkspace({ campaignClaimIds }: { campaignClaimIds: readonly string[] }) {
  const wallet = useWallet();
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);

  return (
    <div className="flex flex-col gap-6 pb-8">
      {wallet.status !== "connected" && (
        <section className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-neutral-400">
            {wallet.status === "unavailable"
              ? "No browser wallet detected. Install an EIP-1193 wallet such as MetaMask to trade on testnet."
              : "Connect a wallet. Use three different wallets for the payer, seller and buyer so each role is visibly separate."}
          </p>
          {wallet.status === "disconnected" && (
            <button
              type="button"
              onClick={() => void wallet.connect()}
              className="self-start rounded-full bg-white px-4 py-2 text-xs font-medium text-black hover:bg-neutral-200"
            >
              Connect wallet
            </button>
          )}
        </section>
      )}
      <FundsCard onChange={changed} />
      <CreateClaimCard onChange={changed} />
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-medium text-white">Your claims and sales</h3>
          <p className="max-w-2xl text-xs text-neutral-500">
            Read live from Sepolia vault events and the Creditcoin market. Each card offers only the
            step your connected wallet may take; permissionless proof steps are open to anyone.
          </p>
        </div>
        <ActivityPanel campaignClaimIds={campaignClaimIds} version={version} onChange={changed} />
      </section>
    </div>
  );
}
