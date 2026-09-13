"use client";

import { useCallback, useState } from "react";
import { deployments } from "@/lib/chain/deployments";
import { encodeWithdraw, readCredits, readLiveMarket } from "@/lib/chain/live-reads";
import { errorMessage } from "@/lib/wallet/eip1193";
import { useWallet } from "../wallet/wallet-provider";

export type WithdrawalState =
  | { readonly phase: "idle" }
  | { readonly phase: "signing" }
  | { readonly phase: "verifying"; readonly hash: string }
  | { readonly phase: "withdrawn"; readonly hash: string }
  | { readonly phase: "failed"; readonly reason: string; readonly hash: string | undefined };

export function useWithdrawal(onSettled: () => void) {
  const wallet = useWallet();
  const [state, setState] = useState<WithdrawalState>({ phase: "idle" });

  const withdraw = useCallback(async () => {
    if (!wallet.address) {
      return;
    }
    setState({ phase: "signing" });
    let hash: string | undefined;
    try {
      const submitted = await wallet.send("cc3", deployments.market, encodeWithdraw());
      hash = submitted.hash;
      if (!submitted.succeeded) {
        setState({ phase: "failed", reason: "Transaction reverted; credits unchanged", hash });
        return;
      }
      setState({ phase: "verifying", hash });
      const remaining = await readCredits(wallet.address, await readLiveMarket());
      setState(
        remaining === 0n
          ? { phase: "withdrawn", hash }
          : { phase: "failed", reason: "Receipt succeeded but credits are still claimable", hash },
      );
    } catch (caught) {
      setState({ phase: "failed", reason: errorMessage(caught), hash });
    } finally {
      onSettled();
    }
  }, [wallet, onSettled]);

  return { state, withdraw };
}
