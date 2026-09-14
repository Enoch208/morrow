"use client";

import type { ProofProgress, SaleTerms } from "@morrow/protocol";
import {
  ConfigurationError,
  prepareBrowserCancellationRecognition,
  prepareBrowserFunding,
  prepareBrowserFundingApproval,
  prepareBrowserSaleProof,
  prepareBrowserSettlement,
  type BrowserProofInput,
} from "@morrow/sdk/browser";
import { useState } from "react";
import { errorMessage } from "@/lib/wallet/eip1193";
import { ActionButton, ActionStatus } from "./action-status";
import { proverUrl, settlementTokenSymbol, tradeOptions } from "./trade-config";
import { isBusy, useWalletAction } from "./use-wallet-action";

type ProofKind = "fund" | "settle" | "recognize";

type ProofState =
  | { readonly phase: "idle" }
  | { readonly phase: "loading"; readonly note: string }
  | { readonly phase: "waiting"; readonly note: string }
  | { readonly phase: "ready"; readonly input: BrowserProofInput }
  | { readonly phase: "unavailable"; readonly note: string };

const events = { fund: "reserve", settle: "assign", recognize: "cancel" } as const;
const labels = {
  fund: "Fund with proof",
  settle: "Settle with proof",
  recognize: "Refund with proof",
} as const;

function progressNote(progress: ProofProgress): string {
  switch (progress.phase) {
    case "awaiting-finality":
      return `Sepolia block ${String(progress.sourceBlock)} is not finalized yet (about 13 minutes)`;
    case "awaiting-attestation":
      return `Waiting for Creditcoin attestors to attest Sepolia block ${String(progress.sourceBlock)}`;
    case "requesting":
      return "Requesting the proof from the Creditcoin prover…";
    case "verifying":
      return "Verifying the proof against the live BlockProver precompile…";
    case "verified":
      return "Proof verified";
    case "unavailable":
    case "refused":
      return progress.reason;
  }
}

export function ProofAction({
  kind,
  terms,
  sourceTransactionHash,
  onSettled,
}: {
  kind: ProofKind;
  terms: SaleTerms;
  sourceTransactionHash: string;
  onSettled: () => void;
}) {
  const [proof, setProof] = useState<ProofState>({ phase: "idle" });
  const approval = useWalletAction("cc3", onSettled);
  const submission = useWalletAction("cc3", onSettled);
  const busy = proof.phase === "loading" || isBusy(approval.state) || isBusy(submission.state);

  const fetchProof = async () => {
    setProof({ phase: "loading", note: "Checking finality and attestation…" });
    let last: ProofProgress | undefined;
    try {
      const result = await prepareBrowserSaleProof(
        terms,
        sourceTransactionHash,
        events[kind],
        { ...tradeOptions, proverUrl },
        (progress) => {
          last = progress;
          setProof({ phase: "loading", note: progressNote(progress) });
        },
      );
      setProof({ phase: "ready", input: { proof: result.proof, sourceTransactionHash } });
    } catch (caught) {
      const waiting = last?.phase === "awaiting-finality" || last?.phase === "awaiting-attestation";
      setProof(
        waiting && last
          ? { phase: "waiting", note: `${progressNote(last)}. Try again in a few minutes.` }
          : {
              phase: "unavailable",
              note: caught instanceof ConfigurationError ? caught.message : errorMessage(caught),
            },
      );
    }
  };

  const approve = () =>
    void approval.run(async (actor, chainId) => {
      const result = await prepareBrowserFundingApproval(terms, actor, chainId, tradeOptions);
      return result.status === "already-approved"
        ? { skip: `Market already approved for the exact price in ${settlementTokenSymbol}` }
        : result.prepared;
    });

  const submit = () => {
    if (proof.phase !== "ready") return;
    const input = proof.input;
    void submission.run((actor, chainId) =>
      kind === "fund"
        ? prepareBrowserFunding(terms, actor, chainId, input, tradeOptions)
        : kind === "settle"
          ? prepareBrowserSettlement(terms, actor, chainId, input, tradeOptions)
          : prepareBrowserCancellationRecognition(terms, actor, chainId, input, tradeOptions),
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        <ActionButton
          label={proof.phase === "ready" ? "Proof verified" : "Get Attestcoin proof"}
          disabled={busy || proof.phase === "ready"}
          onClick={() => void fetchProof()}
        />
        {kind === "fund" && (
          <div className="flex flex-col gap-1">
            <ActionButton
              label={`Approve ${settlementTokenSymbol}`}
              disabled={busy}
              onClick={approve}
            />
            <ActionStatus state={approval.state} chain="cc3" />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <ActionButton
            label={labels[kind]}
            primary
            disabled={busy || proof.phase !== "ready"}
            onClick={submit}
          />
          <ActionStatus state={submission.state} chain="cc3" />
        </div>
      </div>
      {(proof.phase === "loading" ||
        proof.phase === "waiting" ||
        proof.phase === "unavailable") && (
        <p
          className={`text-[11px] ${proof.phase === "unavailable" ? "text-[#FF5A36]" : "text-neutral-400"}`}
        >
          {proof.note}
        </p>
      )}
    </div>
  );
}
