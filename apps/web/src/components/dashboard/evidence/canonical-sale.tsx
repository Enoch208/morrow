import Link from "next/link";
import { claimRoutes } from "@/lib/dashboard-routes";
import type { LedgerClaim } from "@/lib/evidence/claim-ledger";
import { chains, transactionUrl } from "@/lib/explorers";
import { shortHex, utcDay, utcTime } from "@/lib/format/display";
import { AttestedChip } from "../attestation/attested-chip";

const loadBearingOrder = [
  "Reserve on Sepolia",
  "Prove the reservation",
  "Buyer funds into BOUND",
  "Seller preflight confirms BOUND",
  "Assign on Sepolia",
  "Prove the outcome",
  "Settle on Creditcoin",
] as const;

export function CanonicalSale({ claim }: { claim: LedgerClaim }) {
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h3 className="text-base font-medium text-white">
            Canonical sale · {claim.name} · #{claim.claimId}
          </h3>
          <p className="text-xs text-neutral-500">
            One sale round, one source outcome, one destination outcome. The order below is
            load-bearing: funding exists on Creditcoin before the seller gives up the claim on
            Sepolia. The assignment proof was held back past maturity on purpose, and settlement
            still went through.
          </p>
        </div>
        <Link
          href={claimRoutes[claim.prefix]}
          className="w-fit shrink-0 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white hover:text-black"
        >
          Open claim
        </Link>
      </div>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5 font-mono text-[11px] text-neutral-400">
        {loadBearingOrder.map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            {index > 0 && <span className="text-neutral-700">→</span>}
            {step}
          </li>
        ))}
      </ol>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {claim.milestones.map((milestone, index) => (
          <li
            key={milestone.key}
            className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3"
          >
            <span className="font-mono text-[11px] text-neutral-600">
              {(index + 1).toString().padStart(2, "0")}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm text-white">{milestone.label}</span>
              <span className="font-mono text-[10px] text-neutral-500">
                {utcDay(milestone.observedAt)} · {utcTime(milestone.observedAt)}
              </span>
              {milestone.transactionHash && milestone.chain ? (
                <a
                  href={transactionUrl(milestone.chain, milestone.transactionHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-neutral-500 transition-colors hover:text-[#FF5A36]"
                >
                  {shortHex(milestone.transactionHash, 8, 4)} · {chains[milestone.chain].explorer}
                </a>
              ) : (
                <span className="font-mono text-[10px] text-neutral-600">
                  {milestone.evidenceKind}
                </span>
              )}
              {milestone.sourceBlock !== undefined && (
                <AttestedChip height={milestone.sourceBlock} />
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
