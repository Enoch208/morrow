"use client";

import { rolesFor } from "@/lib/chain/deployments";
import { shortHex } from "@/lib/format/display";
import { useWallet } from "./wallet-provider";

const roleNames = { payer: "Payer", seller: "Seller", buyer: "Buyer" } as const;

export function WalletButton() {
  const wallet = useWallet();

  if (wallet.status === "connected" && wallet.address) {
    const roles = rolesFor(wallet.address);
    return (
      <div className="flex items-center gap-3 pl-4 border-l border-white/10">
        <div className="flex flex-col items-end">
          <span className="font-mono text-xs text-white">{shortHex(wallet.address)}</span>
          <span className="text-[10px] text-neutral-500">
            {roles.length > 0 ? roles.map((role) => roleNames[role]).join(" · ") : "Observer"}
          </span>
        </div>
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] ring-2 ring-white/5">
          <span className="h-2 w-2 rounded-full bg-green-500" />
        </span>
      </div>
    );
  }

  const label =
    wallet.status === "detecting"
      ? "Wallet"
      : wallet.status === "unavailable"
        ? "No wallet detected"
        : wallet.status === "connecting"
          ? "Connecting…"
          : "Connect wallet";

  return (
    <div className="flex flex-col items-end gap-1 pl-4 border-l border-white/10">
      <button
        type="button"
        onClick={() => void wallet.connect()}
        disabled={wallet.status !== "disconnected"}
        className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-neutral-500"
      >
        {label}
      </button>
      {wallet.error && <span className="text-[10px] text-[#FF5A36]">{wallet.error}</span>}
    </div>
  );
}
