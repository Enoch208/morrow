"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  readLiveClaim,
  readLiveMarket,
  type LiveClaim,
  type LiveMarket,
} from "@/lib/chain/live-reads";
import { errorMessage } from "@/lib/wallet/eip1193";

export interface LiveClaimRef {
  readonly prefix: string;
  readonly claimId: string;
  readonly round: string;
  readonly saleId: string;
}

export type LiveChainState =
  | { readonly status: "loading" }
  | { readonly status: "unverifiable"; readonly reason: string; readonly observedAt: string }
  | {
      readonly status: "ready";
      readonly market: LiveMarket;
      readonly claims: Readonly<Record<string, LiveClaim>>;
      readonly observedAt: string;
    };

interface LiveChainContextValue {
  readonly state: LiveChainState;
  readonly refreshing: boolean;
  readonly refresh: () => void;
}

const LiveChainContext = createContext<LiveChainContextValue | undefined>(undefined);

async function readAll(refs: readonly LiveClaimRef[]): Promise<LiveChainState> {
  const market = await readLiveMarket();
  const entries = await Promise.all(
    refs.map(async (ref) => {
      const claim = await readLiveClaim(BigInt(ref.claimId), BigInt(ref.round), ref.saleId, market);
      return [ref.prefix, claim] as const;
    }),
  );
  return {
    status: "ready",
    market,
    claims: Object.fromEntries(entries),
    observedAt: new Date().toISOString(),
  };
}

export function LiveChainProvider({
  claims,
  children,
}: {
  claims: readonly LiveClaimRef[];
  children: ReactNode;
}) {
  const [state, setState] = useState<LiveChainState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    readAll(claims).then(
      (next) => {
        if (active) {
          setState(next);
          setRefreshing(false);
        }
      },
      (caught: unknown) => {
        if (active) {
          setState({
            status: "unverifiable",
            reason: errorMessage(caught),
            observedAt: new Date().toISOString(),
          });
          setRefreshing(false);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [claims, version]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    setVersion((current) => current + 1);
  }, []);

  const value = useMemo(() => ({ state, refreshing, refresh }), [state, refreshing, refresh]);
  return <LiveChainContext.Provider value={value}>{children}</LiveChainContext.Provider>;
}

export function useLiveChain(): LiveChainContextValue {
  const context = useContext(LiveChainContext);
  if (!context) {
    throw new Error("useLiveChain must be used inside LiveChainProvider");
  }
  return context;
}
