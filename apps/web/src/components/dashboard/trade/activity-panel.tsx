"use client";

import { readWalletActivity, type WalletClaim, type WalletSale } from "@morrow/sdk/browser";
import { useEffect, useState } from "react";
import { utcDateTimeFromUnix } from "@/lib/format/display";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { formatUnits } from "@/lib/format/token-units";
import { errorMessage } from "@/lib/wallet/eip1193";
import { useWallet } from "../wallet/wallet-provider";
import { ReserveForm } from "./reserve-form";
import { SaleCard } from "./sale-card";
import { sourceTokenSymbol, tradeOptions } from "./trade-config";

type ActivityRead =
  | { readonly status: "idle" | "loading" }
  | {
      readonly status: "ready";
      readonly address: string;
      readonly claims: readonly WalletClaim[];
      readonly sales: readonly WalletSale[];
    }
  | { readonly status: "unverifiable"; readonly reason: string };

function openSale(sales: readonly WalletSale[], claimId: bigint): boolean {
  return sales.some((sale) => sale.terms.claimId === claimId && sale.outcome?.kind !== "cancel");
}

export function ActivityPanel({
  campaignClaimIds,
  version,
  onChange,
}: {
  campaignClaimIds: readonly string[];
  version: number;
  onChange: () => void;
}) {
  const wallet = useWallet();
  const address = wallet.status === "connected" ? wallet.address : undefined;
  const [read, setRead] = useState<ActivityRead>({ status: "idle" });

  useEffect(() => {
    if (!address) return;
    let active = true;
    readWalletActivity(address, tradeOptions).then(
      (activity) => {
        if (!active) return;
        const isNew = (claimId: bigint) => !campaignClaimIds.includes(claimId.toString());
        setRead({
          status: "ready",
          address,
          claims: activity.claims.filter((claim) => isNew(claim.claimId)),
          sales: activity.sales.filter((sale) => isNew(sale.terms.claimId)),
        });
      },
      (caught: unknown) => {
        if (active) setRead({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [address, campaignClaimIds, version]);

  if (!address)
    return (
      <p className="text-xs text-neutral-400">
        Connect a wallet to see claims and sales it takes part in.
      </p>
    );
  if (read.status !== "ready" || read.address !== address)
    return (
      <p className="text-xs text-neutral-400">
        {read.status === "unverifiable"
          ? `Unverifiable: ${read.reason}`
          : "Reading Sepolia vault events…"}
      </p>
    );

  const sellable = read.claims.filter(
    (claim) =>
      claim.beneficiary.toLowerCase() === read.address.toLowerCase() &&
      !openSale(read.sales, claim.claimId),
  );

  return (
    <div className="flex flex-col gap-4">
      {sellable.map((claim) => (
        <article
          key={claim.claimId.toString()}
          className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5"
        >
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">
              Claim #{claim.claimId.toString()} · yours to sell
            </span>
            <h4 className="text-base font-medium text-white">
              {formatUnits(claim.faceValueRaw, testTokenDecimals)} {sourceTokenSymbol} locked until{" "}
              {utcDateTimeFromUnix(claim.maturity)}
            </h4>
          </div>
          <ReserveForm claim={claim} onChange={onChange} />
        </article>
      ))}
      {read.sales.map((sale) => (
        <SaleCard key={sale.saleId} sale={sale} viewer={read.address} />
      ))}
      {sellable.length === 0 && read.sales.length === 0 && (
        <p className="text-xs text-neutral-400">
          This wallet has no new claims or sales yet. Campaign claims #
          {campaignClaimIds.join(", #")} stay read-only in Claims.
        </p>
      )}
    </div>
  );
}
