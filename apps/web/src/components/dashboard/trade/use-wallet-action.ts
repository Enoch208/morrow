"use client";

import type { PreparedTransaction } from "@morrow/protocol";
import { ConfigurationError, confirmPreparedWallet } from "@morrow/sdk/browser";
import { useCallback, useState } from "react";
import type { ChainKey } from "@/lib/explorers";
import { switchToChain } from "@/lib/wallet/chain-switch";
import { errorMessage, injectedProvider } from "@/lib/wallet/eip1193";
import { useWallet } from "../wallet/wallet-provider";

export type ActionState =
  | { readonly phase: "idle" }
  | { readonly phase: "preparing" }
  | { readonly phase: "signing" }
  | { readonly phase: "confirming"; readonly hash: string }
  | { readonly phase: "done"; readonly hash: string }
  | { readonly phase: "skipped"; readonly note: string }
  | { readonly phase: "refused"; readonly reason: string }
  | { readonly phase: "failed"; readonly reason: string; readonly hash?: string };

export type Preparation = PreparedTransaction | { readonly skip: string };

export function isBusy(state: ActionState): boolean {
  return state.phase === "preparing" || state.phase === "signing" || state.phase === "confirming";
}

function firstAccount(value: unknown): string {
  if (!Array.isArray(value) || typeof value[0] !== "string")
    throw new ConfigurationError("Connect a wallet first");
  return value[0];
}

export function useWalletAction(chain: ChainKey, onSettled: () => void) {
  const wallet = useWallet();
  const [state, setState] = useState<ActionState>({ phase: "idle" });

  const run = useCallback(
    async (
      prepare: (actor: string, chainId: bigint) => Promise<Preparation>,
      verify?: () => Promise<string | undefined>,
    ) => {
      const provider = injectedProvider();
      if (!provider) {
        setState({ phase: "refused", reason: "No browser wallet detected" });
        return;
      }
      setState({ phase: "preparing" });
      let hash: string | undefined;
      try {
        await switchToChain(provider, chain);
        const [accounts, chainId] = await Promise.all([
          provider.request({ method: "eth_accounts" }),
          provider.request({ method: "eth_chainId" }),
        ]);
        const prepared = await prepare(firstAccount(accounts), BigInt(String(chainId)));
        if ("skip" in prepared) {
          setState({ phase: "skipped", note: prepared.skip });
          return;
        }
        await confirmPreparedWallet(provider, prepared);
        setState({ phase: "signing" });
        const submitted = await wallet.send(chain, prepared.to, prepared.data);
        hash = submitted.hash;
        if (!submitted.succeeded) {
          setState({ phase: "failed", reason: "Transaction reverted; nothing changed", hash });
          return;
        }
        setState({ phase: "confirming", hash });
        const problem = verify ? await verify() : undefined;
        setState(problem ? { phase: "failed", reason: problem, hash } : { phase: "done", hash });
      } catch (caught) {
        setState(
          caught instanceof ConfigurationError
            ? { phase: "refused", reason: caught.message }
            : { phase: "failed", reason: errorMessage(caught), ...(hash ? { hash } : {}) },
        );
      } finally {
        onSettled();
      }
    },
    [chain, wallet, onSettled],
  );

  return {
    state,
    run,
    reset: () => {
      setState({ phase: "idle" });
    },
  };
}
