"use client";

import { readSaleProgress, type SaleProgress, type WalletSale } from "@morrow/sdk/browser";
import { useCallback, useEffect, useState } from "react";
import { transactionUrl } from "@/lib/explorers";
import { shortHex, utcDateTimeFromUnix } from "@/lib/format/display";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { formatUnits } from "@/lib/format/token-units";
import { errorMessage } from "@/lib/wallet/eip1193";
import { saleStage, viewerMayAct } from "./sale-steps";
import { StageAction } from "./stage-action";
import { settlementTokenSymbol, sourceTokenSymbol, tradeOptions } from "./trade-config";

type ProgressRead =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly progress: SaleProgress; readonly now: bigint }
  | { readonly status: "unverifiable"; readonly reason: string };

export function SaleCard({ sale, viewer }: { sale: WalletSale; viewer: string }) {
  const [read, setRead] = useState<ProgressRead>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const { terms } = sale;

  useEffect(() => {
    let active = true;
    readSaleProgress(terms, viewer, tradeOptions).then(
      (progress) => {
        if (active)
          setRead({ status: "ready", progress, now: BigInt(Math.floor(Date.now() / 1000)) });
      },
      (caught: unknown) => {
        if (active) setRead({ status: "unverifiable", reason: errorMessage(caught) });
      },
    );
    return () => {
      active = false;
    };
  }, [terms, viewer, version]);

  const refresh = useCallback(() => {
    setVersion((value) => value + 1);
  }, []);
  const stage =
    read.status === "ready" ? saleStage(read.progress, terms, viewer, read.now) : undefined;

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5">
      <header className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500">
            Claim #{terms.claimId.toString()} · round {terms.round.toString()}
          </span>
          <h4 className="text-base font-medium text-white">
            {stage?.headline ??
              (read.status === "unverifiable" ? "Unverifiable" : "Reading both chains…")}
          </h4>
          <p className="max-w-2xl text-xs text-neutral-500">
            {stage?.detail ?? (read.status === "unverifiable" ? read.reason : "")}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="self-start text-[11px] text-neutral-500 hover:text-white"
        >
          Re-read chains
        </button>
      </header>
      <dl className="grid grid-cols-2 gap-3 font-mono text-[11px] md:grid-cols-4">
        <div>
          <dt className="text-neutral-600">Locked payout</dt>
          <dd className="text-white">
            {formatUnits(terms.sourceFaceValueRaw, testTokenDecimals)} {sourceTokenSymbol}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-600">Buyer pays</dt>
          <dd className="text-white">
            {formatUnits(terms.grossPurchasePriceRaw, testTokenDecimals)} {settlementTokenSymbol}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-600">Fund before</dt>
          <dd className="text-white">{utcDateTimeFromUnix(terms.fundBefore)}</dd>
        </div>
        <div>
          <dt className="text-neutral-600">Unlocks</dt>
          <dd className="text-white">{utcDateTimeFromUnix(terms.maturity)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-neutral-600">Seller</dt>
          <dd className="text-white">{shortHex(terms.seller)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-neutral-600">Buyer</dt>
          <dd className="text-white">{shortHex(terms.buyer)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-3 text-[11px]">
        <a
          href={transactionUrl("sepolia", sale.reservationHash)}
          target="_blank"
          rel="noreferrer"
          className="text-neutral-500 hover:text-white"
        >
          Reservation ↗
        </a>
        {read.status === "ready" && read.progress.fundingHash && (
          <a
            href={transactionUrl("cc3", read.progress.fundingHash)}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 hover:text-white"
          >
            Funding ↗
          </a>
        )}
        {sale.outcome && (
          <a
            href={transactionUrl("sepolia", sale.outcome.hash)}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 hover:text-white"
          >
            {sale.outcome.kind === "assign" ? "Assignment ↗" : "Cancellation ↗"}
          </a>
        )}
        {read.status === "ready" && read.progress.recognitionHash && (
          <a
            href={transactionUrl("cc3", read.progress.recognitionHash)}
            target="_blank"
            rel="noreferrer"
            className="text-neutral-500 hover:text-white"
          >
            Settlement ↗
          </a>
        )}
      </div>
      {stage && read.status === "ready" && viewerMayAct(stage, terms, viewer) && (
        <StageAction stage={stage} sale={sale} progress={read.progress} onSettled={refresh} />
      )}
      {stage &&
        read.status === "ready" &&
        stage.action !== "none" &&
        !viewerMayAct(stage, terms, viewer) && (
          <p className="text-[11px] text-neutral-500">
            Next step belongs to the {stage.actor}. Share this page with them.
          </p>
        )}
    </article>
  );
}
