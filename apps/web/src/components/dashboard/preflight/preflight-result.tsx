import type { PreflightOutcome } from "@/lib/chain/seller-preflight";
import { shortHex, utcTime } from "@/lib/format/display";
import { formatUnits } from "@/lib/format/token-units";

export function PreflightResult({ outcome }: { outcome: PreflightOutcome }) {
  if (outcome.kind === "passed") {
    const { prepared } = outcome;
    return (
      <div className="flex flex-col gap-1.5 rounded-lg border border-green-500/20 bg-green-500/5 px-4 py-3 font-mono text-[11px]">
        <span className="text-green-500">
          All checks passed · assignment prepared, nothing signed
        </span>
        <span className="text-neutral-400">
          Sepolia block {prepared.sourceBlock.toLocaleString("en-US")} ·{" "}
          {shortHex(prepared.sourceBlockHash, 8, 4)} · CC3 block{" "}
          {prepared.destinationBlock.toLocaleString("en-US")} ·{" "}
          {shortHex(prepared.destinationBlockHash, 8, 4)}
        </span>
        <span className="text-neutral-400">
          Seller net {formatUnits(prepared.sellerNetRaw, 6)} mSET after{" "}
          {formatUnits(prepared.feeRaw, 6)} fee · assignSale to {shortHex(prepared.to)}
        </span>
        <span className="text-neutral-600">checked {utcTime(outcome.checkedAt)}</span>
      </div>
    );
  }
  const refused = outcome.kind === "refused";
  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border px-4 py-3 font-mono text-[11px] ${
        refused ? "border-[#FF5A36]/20 bg-[#FF5A36]/5" : "border-white/10 bg-white/[0.02]"
      }`}
    >
      <span className={refused ? "text-[#FF5A36]" : "text-neutral-300"}>
        {refused ? "Refused · " : "Unverifiable · "}
        {outcome.reason}
      </span>
      <span className="text-neutral-500">
        {refused
          ? "Fails closed: no assignment is prepared and no signature is requested."
          : "A required read failed, so the preflight stops rather than trusting cached state."}
      </span>
      <span className="text-neutral-600">checked {utcTime(outcome.checkedAt)}</span>
    </div>
  );
}
