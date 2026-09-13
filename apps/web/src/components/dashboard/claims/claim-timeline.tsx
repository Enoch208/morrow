import type { LedgerMilestone } from "@/lib/evidence/claim-ledger";
import { chains, transactionUrl } from "@/lib/explorers";
import { shortHex, utcDay, utcTime } from "@/lib/format/display";

export function ClaimTimeline({ milestones }: { milestones: readonly LedgerMilestone[] }) {
  return (
    <ol className="relative flex flex-col gap-4 pl-5">
      <div className="absolute left-[3px] top-2 bottom-2 w-px bg-white/10" />
      {milestones.map((milestone) => (
        <li key={milestone.key} className="relative flex flex-col gap-0.5">
          <span className="absolute -left-5 top-1.5 h-[7px] w-[7px] rounded-full bg-green-500 ring-4 ring-[#0a0a0a]" />
          <span className="text-sm text-white">{milestone.label}</span>
          <div className="flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-neutral-500">
            <span>
              {utcDay(milestone.observedAt)} · {utcTime(milestone.observedAt)}
            </span>
            <span className="text-neutral-700">/</span>
            {milestone.transactionHash && milestone.chain ? (
              <a
                href={transactionUrl(milestone.chain, milestone.transactionHash)}
                target="_blank"
                rel="noreferrer"
                className="hover:text-[#FF5A36] transition-colors"
              >
                {shortHex(milestone.transactionHash, 8, 4)} · {chains[milestone.chain].explorer}
              </a>
            ) : (
              <span className="text-neutral-600">{milestone.evidenceKind}</span>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
