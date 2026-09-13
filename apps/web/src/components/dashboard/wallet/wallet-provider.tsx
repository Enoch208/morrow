"use client";

import { BrowserProvider } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { ChainKey } from "@/lib/explorers";
import { switchToChain } from "@/lib/wallet/chain-switch";
import { errorMessage, injectedProvider } from "@/lib/wallet/eip1193";

export type WalletStatus =
  "detecting" | "unavailable" | "disconnected" | "connecting" | "connected";

export interface SubmittedTransaction {
  readonly hash: string;
  readonly succeeded: boolean;
}

interface WalletState {
  readonly status: WalletStatus;
  readonly address: string | undefined;
  readonly chainId: number | undefined;
  readonly error: string | undefined;
  readonly connect: () => Promise<void>;
  readonly send: (chain: ChainKey, to: string, data: string) => Promise<SubmittedTransaction>;
}

type AccountStatus = "disconnected" | "connecting" | "connected";

const WalletContext = createContext<WalletState | undefined>(undefined);

function firstAccount(value: unknown): string | undefined {
  return Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

function parseChainId(value: unknown): number | undefined {
  return typeof value === "string" ? Number.parseInt(value, 16) : undefined;
}

function subscribeToNothing(): () => void {
  return () => undefined;
}

function providerPresence(): "present" | "absent" {
  return injectedProvider() ? "present" : "absent";
}

function serverPresence(): "unknown" {
  return "unknown";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const presence = useSyncExternalStore(subscribeToNothing, providerPresence, serverPresence);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("disconnected");
  const [address, setAddress] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const provider = injectedProvider();
    if (!provider) {
      return;
    }
    const onAccounts = (value: unknown) => {
      const account = firstAccount(value);
      setAddress(account);
      setAccountStatus(account ? "connected" : "disconnected");
    };
    const onChain = (value: unknown) => {
      setChainId(parseChainId(value));
    };
    void Promise.all([
      provider.request({ method: "eth_accounts" }),
      provider.request({ method: "eth_chainId" }),
    ]).then(([accounts, chain]) => {
      onAccounts(accounts);
      onChain(chain);
    });
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const provider = injectedProvider();
    if (!provider) {
      return;
    }
    setAccountStatus("connecting");
    setError(undefined);
    try {
      const account = firstAccount(await provider.request({ method: "eth_requestAccounts" }));
      setAddress(account);
      setChainId(parseChainId(await provider.request({ method: "eth_chainId" })));
      setAccountStatus(account ? "connected" : "disconnected");
    } catch (caught) {
      setError(errorMessage(caught));
      setAccountStatus("disconnected");
    }
  }, []);

  const send = useCallback(async (chain: ChainKey, to: string, data: string) => {
    const provider = injectedProvider();
    if (!provider) {
      throw new Error("No browser wallet detected");
    }
    await switchToChain(provider, chain);
    const signer = await new BrowserProvider(provider).getSigner();
    const response = await signer.sendTransaction({ to, data });
    const receipt = await response.wait();
    return { hash: response.hash, succeeded: receipt?.status === 1 };
  }, []);

  const status: WalletStatus =
    presence === "unknown" ? "detecting" : presence === "absent" ? "unavailable" : accountStatus;

  const value = useMemo(
    () => ({ status, address, chainId, error, connect, send }),
    [status, address, chainId, error, connect, send],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside WalletProvider");
  }
  return context;
}
