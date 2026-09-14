"use client";

import type { SaleTerms } from "@morrow/protocol";
import {
  campaignContracts,
  prepareBrowserReservation,
  quoteEconomics,
  readClaimState,
  readMarketRules,
  type WalletClaim,
} from "@morrow/sdk/browser";
import { getAddress, isAddress, parseUnits } from "ethers";
import { useEffect, useState } from "react";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { formatUnits } from "@/lib/format/token-units";
import { ActionButton, ActionStatus } from "./action-status";
import { settlementTokenSymbol, tradeOptions } from "./trade-config";
import { isBusy, useWalletAction } from "./use-wallet-action";

const field =
  "w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none";

const fundMinutes = 60;
const assignMinutes = 120;

export async function buildTerms(
  claim: WalletClaim,
  seller: string,
  buyer: string,
  grossPurchasePriceRaw: bigint,
): Promise<SaleTerms> {
  const [{ claim: live }, rules] = await Promise.all([
    readClaimState(claim.claimId, tradeOptions),
    readMarketRules(tradeOptions),
  ]);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const assignBefore = now + BigInt(assignMinutes * 60);
  return {
    protocolVersion: 1n,
    sourceEvmChainId: campaignContracts.vault.chainId,
    sourceVault: campaignContracts.vault.address,
    claimId: claim.claimId,
    round: live.latestRound + 1n,
    destinationEvmChainId: campaignContracts.market.chainId,
    destinationMarket: campaignContracts.market.address,
    seller: getAddress(seller) as SaleTerms["seller"],
    buyer: getAddress(buyer) as SaleTerms["buyer"],
    sourceToken: live.sourceToken,
    sourceFaceValueRaw: live.sourceFaceValueRaw,
    maturity: live.maturity,
    settlementToken: campaignContracts.settlementToken.address,
    grossPurchasePriceRaw,
    feeBps: rules.feeBps,
    feeRecipient: rules.feeRecipient as SaleTerms["feeRecipient"],
    fundBefore: now + BigInt(fundMinutes * 60),
    assignBefore,
  };
}

export function ReserveForm({ claim, onChange }: { claim: WalletClaim; onChange: () => void }) {
  const [buyer, setBuyer] = useState("");
  const [price, setPrice] = useState(
    formatUnits((claim.faceValueRaw * 9_410n) / 10_000n, testTokenDecimals).replaceAll(",", ""),
  );
  const reservation = useWalletAction("sepolia", onChange);
  const [feeBps, setFeeBps] = useState<bigint>();
  useEffect(() => {
    let active = true;
    readMarketRules(tradeOptions).then(
      (rules) => {
        if (active) setFeeBps(rules.feeBps);
      },
      () => {
        if (active) setFeeBps(undefined);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  let gross: bigint | undefined;
  try {
    gross = parseUnits(price, testTokenDecimals);
  } catch {
    gross = undefined;
  }
  const economics =
    gross && gross > 0n && feeBps !== undefined ? quoteEconomics(gross, feeBps) : undefined;
  const ready = isAddress(buyer) && economics !== undefined;

  const reserve = () => {
    if (!ready || gross === undefined) return;
    const grossRaw = gross;
    void reservation.run(async (actor, chainId) =>
      prepareBrowserReservation(
        await buildTerms(claim, actor, buyer, grossRaw),
        actor,
        chainId,
        tradeOptions,
      ),
    );
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 p-4">
      <p className="text-xs text-neutral-400">
        2 · Seller offers the claim to one buyer. Terms are frozen on Sepolia: the buyer has{" "}
        {fundMinutes} minutes to fund and you have {assignMinutes} minutes to assign. After that
        anyone can cancel, and a funded buyer is refunded in full.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Buyer address (their Creditcoin wallet)
          <input
            id={`buyer-${claim.claimId.toString()}`}
            className={field}
            value={buyer}
            onChange={(event) => {
              setBuyer(event.target.value.trim());
            }}
            placeholder="0x…"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Price the buyer pays ({settlementTokenSymbol})
          <input
            id={`price-${claim.claimId.toString()}`}
            className={field}
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
            }}
            inputMode="decimal"
          />
        </label>
      </div>
      {economics && (
        <p className="font-mono text-[11px] text-neutral-500">
          Market fee {String(feeBps)} bps = {formatUnits(economics.feeRaw, testTokenDecimals)} · you
          receive {formatUnits(economics.sellerNetRaw, testTokenDecimals)} {settlementTokenSymbol}{" "}
          after settlement
        </p>
      )}
      <div className="flex flex-col gap-1">
        <ActionButton
          label="Reserve sale on Sepolia"
          primary
          disabled={!ready || isBusy(reservation.state)}
          onClick={reserve}
        />
        <ActionStatus state={reservation.state} chain="sepolia" />
      </div>
    </div>
  );
}
