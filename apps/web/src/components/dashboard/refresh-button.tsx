"use client";

import { RefreshIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiveChain } from "./live/live-chain-provider";

export function RefreshButton() {
  const { refresh, refreshing, state } = useLiveChain();
  const busy = refreshing || state.status === "loading";

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={busy}
      aria-label="Refresh live chain state"
      className="relative p-2 text-neutral-400 hover:text-[#FF5A36] transition-colors disabled:cursor-wait"
    >
      <HugeiconsIcon icon={RefreshIcon} size={20} className={busy ? "animate-spin" : ""} />
    </button>
  );
}
