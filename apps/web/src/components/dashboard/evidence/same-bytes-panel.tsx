"use client";

import { useMemo, useState } from "react";
import { deployments } from "@/lib/chain/deployments";
import { fingerprintProofs } from "@/lib/chain/proof-fingerprint";
import {
  callNativeVerify,
  replayCall,
  type NativeVerifyOutcome,
  type ReplayOutcome,
} from "@/lib/chain/replay";
import type { SameBytesEvidence } from "@/lib/evidence/same-bytes";
import { shortHex } from "@/lib/format/display";

type Verdicts =
  | { readonly status: "idle" | "running" }
  | {
      readonly status: "done";
      readonly native: NativeVerifyOutcome;
      readonly market: ReplayOutcome;
    };

function nativeText(outcome: NativeVerifyOutcome): { text: string; tone: string } {
  if (outcome.kind === "returned") {
    return outcome.verified
      ? { text: "verify(...) returned true · proof is authentic", tone: "text-green-500" }
      : { text: "verify(...) returned false", tone: "text-[#FF5A36]" };
  }
  if (outcome.kind === "rejected") {
    return { text: `Reverted · ${outcome.error}`, tone: "text-neutral-300" };
  }
  return { text: `Unverifiable · ${outcome.reason}`, tone: "text-neutral-400" };
}

function marketText(outcome: ReplayOutcome, expected: string): { text: string; tone: string } {
  if (outcome.kind === "rejected") {
    return outcome.error === expected
      ? { text: `fundReservation(...) reverted · ${outcome.error}`, tone: "text-green-500" }
      : { text: `Reverted · ${outcome.error}`, tone: "text-neutral-300" };
  }
  if (outcome.kind === "accepted") {
    return { text: "Accepted · contradicts the recorded refusal", tone: "text-[#FF5A36]" };
  }
  return { text: `Unverifiable · ${outcome.reason}`, tone: "text-neutral-400" };
}

function VerdictColumn({
  title,
  target,
  line,
}: {
  title: string;
  target: string;
  line: { text: string; tone: string } | undefined;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-4">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
        {title}
      </span>
      <span className="font-mono text-[11px] text-neutral-500">{target}</span>
      <span className={`font-mono text-xs ${line?.tone ?? "text-neutral-600"}`}>
        {line?.text ?? "Not run yet"}
      </span>
    </div>
  );
}

export function SameBytesPanel({ evidence }: { evidence: SameBytesEvidence }) {
  const [verdicts, setVerdicts] = useState<Verdicts>({ status: "idle" });
  const fingerprint = useMemo(
    () => fingerprintProofs(evidence.nativeCalldata, evidence.marketCalldata),
    [evidence],
  );

  const run = () => {
    setVerdicts({ status: "running" });
    void Promise.all([
      callNativeVerify(evidence.nativeCalldata, evidence.recordedBlock),
      replayCall("cc3", deployments.market, evidence.marketCalldata, evidence.recordedBlock),
    ]).then(([native, market]) => {
      setVerdicts({ status: "done", native, market });
    });
  };

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h3 className="text-base font-medium text-white">Same bytes, two verdicts</h3>
          <p className="text-xs text-neutral-500">
            An authentic Attestcoin proof from Claim B, submitted to fund Claim A. Creditcoin&apos;s
            native verifier confirms the proof is real. Morrow still refuses it, because the proven
            event belongs to a different sale.
          </p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={verdicts.status === "running"}
          className="w-fit shrink-0 rounded-full bg-white px-4 py-2 text-xs font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-wait disabled:bg-white/10 disabled:text-neutral-500"
        >
          {verdicts.status === "running"
            ? "Calling Creditcoin…"
            : `Run both at CC3 block ${evidence.recordedBlock.toLocaleString("en-US")}`}
        </button>
      </div>

      <div className="flex flex-col gap-1 rounded-xl border border-white/5 px-4 py-3 font-mono text-[11px] text-neutral-500">
        <span className={fingerprint.identical ? "text-green-500" : "text-[#FF5A36]"}>
          {fingerprint.identical
            ? "Proof fields are byte-identical in both calls"
            : "Proof fields differ between the calls"}
        </span>
        <span>
          keccak256(proof fields) · native {shortHex(fingerprint.nativeHash, 10, 8)} · market{" "}
          {shortHex(fingerprint.marketHash, 10, 8)}
        </span>
        <span>
          chain key {fingerprint.chainKey} · Sepolia block{" "}
          {Number(fingerprint.sourceBlock).toLocaleString("en-US")} ·{" "}
          {fingerprint.encodedTransactionBytes.toLocaleString("en-US")} bytes of encoded transaction
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <VerdictColumn
          title="Creditcoin native verifier"
          target="BlockProver 0x…0FD2 · verify"
          line={verdicts.status === "done" ? nativeText(verdicts.native) : undefined}
        />
        <VerdictColumn
          title="Morrow market"
          target={`${shortHex(deployments.market)} · fundReservation`}
          line={
            verdicts.status === "done"
              ? marketText(verdicts.market, evidence.recordedError)
              : undefined
          }
        />
      </div>

      <span className="font-mono text-[10px] text-neutral-600">
        historical-replay · read-only eth_call at the block the refusal was recorded, no wallet ·
        proof from {evidence.proofSource}
      </span>
    </div>
  );
}
