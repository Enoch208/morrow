"use client";

import {
  prepareBrowserClaim,
  prepareBrowserClaimApproval,
  type ClaimRequest,
} from "@morrow/sdk/browser";
import { isAddress, parseUnits } from "ethers";
import { useState } from "react";
import { testTokenDecimals } from "@/lib/format/sale-amounts";
import { ActionButton, ActionStatus } from "./action-status";
import { sourceTokenSymbol, tradeOptions } from "./trade-config";
import { isBusy, useWalletAction } from "./use-wallet-action";

const maturityChoices = [
  { label: "In 3 hours", seconds: 10_800 },
  { label: "In 12 hours", seconds: 43_200 },
  { label: "In 2 days", seconds: 172_800 },
] as const;

function parseRequest(amount: string, recipient: string, seconds: number): ClaimRequest | string {
  if (!isAddress(recipient)) return "Enter the recipient's wallet address";
  try {
    const faceValueRaw = parseUnits(amount, testTokenDecimals);
    if (faceValueRaw <= 0n) return "Enter a positive amount";
    return {
      faceValueRaw,
      beneficiary: recipient,
      maturity: BigInt(Math.floor(Date.now() / 1000) + seconds),
    };
  } catch {
    return "Enter an amount with at most 6 decimals";
  }
}

const field =
  "w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none";

export function CreateClaimCard({ onChange }: { onChange: () => void }) {
  const [amount, setAmount] = useState("10000");
  const [recipient, setRecipient] = useState("");
  const [seconds, setSeconds] = useState<number>(maturityChoices[1].seconds);
  const approval = useWalletAction("sepolia", onChange);
  const creation = useWalletAction("sepolia", onChange);
  const request = parseRequest(amount, recipient, seconds);
  const invalid = typeof request === "string" ? request : undefined;
  const busy = isBusy(approval.state) || isBusy(creation.state);

  const approve = () => {
    if (typeof request === "string") return;
    void approval.run(async (actor, chainId) => {
      const result = await prepareBrowserClaimApproval(request, actor, chainId, tradeOptions);
      return result.status === "already-approved"
        ? { skip: `Vault already approved for exactly ${amount} ${sourceTokenSymbol}` }
        : result.prepared;
    });
  };

  const create = () => {
    if (typeof request === "string") return;
    void creation.run((actor, chainId) =>
      prepareBrowserClaim(request, actor, chainId, tradeOptions),
    );
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-white">1 · Payer funds a locked payout</h3>
        <p className="max-w-2xl text-xs text-neutral-500">
          The payer locks the full amount in the Sepolia vault for a recipient. Nobody, including
          the payer, can take it back before maturity; at maturity it goes to whoever owns the claim
          then.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Amount ({sourceTokenSymbol})
          <input
            id="claim-amount"
            className={field}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            inputMode="decimal"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Recipient (seller) address
          <input
            id="claim-recipient"
            className={field}
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value.trim());
            }}
            placeholder="0x…"
            spellCheck={false}
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-neutral-500">
          Unlocks
          <select
            id="claim-maturity"
            className={field}
            value={seconds}
            onChange={(event) => {
              setSeconds(Number(event.target.value));
            }}
          >
            {maturityChoices.map((choice) => (
              <option key={choice.seconds} value={choice.seconds}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {invalid && recipient !== "" && <p className="text-[11px] text-neutral-400">{invalid}</p>}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col gap-1">
          <ActionButton
            label="Approve vault"
            disabled={busy || invalid !== undefined}
            onClick={approve}
          />
          <ActionStatus state={approval.state} chain="sepolia" />
        </div>
        <div className="flex flex-col gap-1">
          <ActionButton
            label="Lock payout"
            primary
            disabled={busy || invalid !== undefined}
            onClick={create}
          />
          <ActionStatus state={creation.state} chain="sepolia" />
        </div>
      </div>
    </section>
  );
}
