"use client";

import type { SaleTerms } from "@morrow/protocol";
import { useCallback, useState } from "react";
import { readLiveClaim, readLiveMarket } from "@/lib/chain/live-reads";
import { runSellerPreflight, type PreflightOutcome } from "@/lib/chain/seller-preflight";
import { switchToChain } from "@/lib/wallet/chain-switch";
import { errorMessage, injectedProvider } from "@/lib/wallet/eip1193";
import { useLiveChain } from "../live/live-chain-provider";
import { useWallet } from "../wallet/wallet-provider";

export type AssignmentState =
  | { readonly phase: "idle" }
  | { readonly phase: "checking" }
  | { readonly phase: "checked"; readonly outcome: PreflightOutcome }
  | { readonly phase: "signing"; readonly outcome: PreflightOutcome }
  | { readonly phase: "assigned"; readonly hash: string }
  | { readonly phase: "failed"; readonly reason: string; readonly hash: string | undefined };

const sepoliaChainId = 11155111n;

export function useSellerAssignment(terms: SaleTerms, fundingHash: string, saleId: string) {
  const wallet = useWallet();
  const { refresh } = useLiveChain();
  const [state, setState] = useState<AssignmentState>({ phase: "idle" });
  const isSeller =
    wallet.status === "connected" && wallet.address?.toLowerCase() === terms.seller.toLowerCase();

  const inspect = useCallback(async () => {
    setState({ phase: "checking" });
    const outcome = await runSellerPreflight(terms, terms.seller, sepoliaChainId, fundingHash);
    setState({ phase: "checked", outcome });
  }, [terms, fundingHash]);

  const assign = useCallback(async () => {
    const provider = injectedProvider();
    if (!provider || !wallet.address) {
      return;
    }
    setState({ phase: "checking" });
    let hash: string | undefined;
    try {
      await switchToChain(provider, "sepolia");
      const outcome = await runSellerPreflight(terms, wallet.address, sepoliaChainId, fundingHash);
      if (outcome.kind !== "passed") {
        setState({ phase: "checked", outcome });
        return;
      }
      setState({ phase: "signing", outcome });
      const submitted = await wallet.send("sepolia", outcome.prepared.to, outcome.prepared.data);
      hash = submitted.hash;
      const round = await readLiveClaim(terms.claimId, terms.round, saleId, await readLiveMarket());
      setState(
        submitted.succeeded && round.roundState === "ASSIGNED"
          ? { phase: "assigned", hash }
          : {
              phase: "failed",
              reason: `Transaction mined but round reads ${round.roundState}`,
              hash,
            },
      );
    } catch (caught) {
      setState({ phase: "failed", reason: errorMessage(caught), hash });
    } finally {
      refresh();
    }
  }, [terms, fundingHash, saleId, wallet, refresh]);

  return { state, isSeller, inspect, assign };
}
