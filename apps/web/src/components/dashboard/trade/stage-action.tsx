"use client";

import {
  prepareBrowserCancellation,
  prepareBrowserRedemption,
  type SaleProgress,
  type WalletSale,
} from "@morrow/sdk/browser";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { formatUnits } from "@/lib/format/token-units";
import { useWithdrawal } from "../overview/use-withdrawal";
import { SellerPreflightCard } from "../preflight/seller-preflight-card";
import { ActionButton, ActionStatus } from "./action-status";
import { ProofAction } from "./proof-action";
import type { SaleStage } from "./sale-steps";
import { settlementTokenSymbol, tradeOptions } from "./trade-config";
import { isBusy, useWalletAction } from "./use-wallet-action";

export function StageAction({
  stage,
  sale,
  progress,
  onSettled,
}: {
  stage: SaleStage;
  sale: WalletSale;
  progress: SaleProgress;
  onSettled: () => void;
}) {
  const source = useWalletAction("sepolia", onSettled);
  const { state: withdrawal, withdraw } = useWithdrawal(onSettled);
  const { terms } = sale;
  switch (stage.action) {
    case "fund":
      return (
        <ProofAction
          kind="fund"
          terms={terms}
          sourceTransactionHash={sale.reservationHash}
          onSettled={onSettled}
        />
      );
    case "settle":
    case "recognize":
      return sale.outcome ? (
        <ProofAction
          kind={stage.action}
          terms={terms}
          sourceTransactionHash={sale.outcome.hash}
          onSettled={onSettled}
        />
      ) : (
        <p className="text-[11px] text-neutral-400">
          Waiting for the source outcome log to be indexed.
        </p>
      );
    case "assign":
      return progress.fundingHash ? (
        <SellerPreflightCard
          terms={terms}
          fundingHash={progress.fundingHash}
          saleId={sale.saleId}
        />
      ) : (
        <p className="text-[11px] text-neutral-400">
          Funding transaction not found on Creditcoin yet.
        </p>
      );
    case "cancel":
    case "redeem":
      return (
        <div className="flex flex-col gap-1">
          <ActionButton
            label={
              stage.action === "cancel"
                ? "Cancel expired reservation"
                : "Redeem payout to current owner"
            }
            primary
            disabled={isBusy(source.state)}
            onClick={() =>
              void source.run((actor, chainId) =>
                stage.action === "cancel"
                  ? prepareBrowserCancellation(terms, actor, chainId, tradeOptions)
                  : prepareBrowserRedemption(terms.claimId, actor, chainId, tradeOptions),
              )
            }
          />
          <ActionStatus state={source.state} chain="sepolia" />
        </div>
      );
    case "withdraw":
      return (
        <div className="flex flex-col gap-1">
          <ActionButton
            label={`Withdraw ${formatUnits(progress.viewerCreditRaw, testTokenDecimals)} ${settlementTokenSymbol}`}
            primary
            disabled={withdrawal.phase === "signing" || withdrawal.phase === "verifying"}
            onClick={() => void withdraw()}
          />
          <p className="text-[11px] text-neutral-400">
            {withdrawal.phase === "failed"
              ? withdrawal.reason
              : withdrawal.phase === "withdrawn"
                ? "Withdrawn and verified"
                : ""}
          </p>
        </div>
      );
    case "none":
      return null;
  }
}
