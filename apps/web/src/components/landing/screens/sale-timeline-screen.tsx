import type { ClaimAEvidence, Milestone } from "@/lib/evidence/claim-a-snapshot";
import { shortHex, utcTime } from "@/lib/format/display";
import { EvidenceUnavailable } from "./evidence-unavailable";

function milestoneDetail(milestone: Milestone): string {
  if (milestone.transactionHash) {
    const block =
      milestone.blockNumber === undefined
        ? ""
        : ` · block ${milestone.blockNumber.toLocaleString("en-US")}`;
    return `${shortHex(milestone.transactionHash)}${block}`;
  }
  return milestone.note ?? "";
}

function MilestoneRow({ milestone }: { milestone: Milestone }) {
  return (
    <li className="flex items-center gap-[2cqw]">
      <span
        className={`size-[1.4cqw] shrink-0 rounded-full ${
          milestone.complete ? "bg-green-500" : "animate-pulse bg-[#FF5A36]"
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-[2.3cqw] ${milestone.complete ? "text-neutral-100" : "text-[#FF5A36]"}`}
        >
          {milestone.label}
        </span>
        <span className="truncate font-mono text-[1.7cqw] text-neutral-500">
          {milestoneDetail(milestone)}
        </span>
      </div>
      <span className="shrink-0 font-mono text-[1.7cqw] text-neutral-500">
        {milestone.observedAt ? utcTime(milestone.observedAt) : "pending"}
      </span>
    </li>
  );
}

export function SaleTimelineScreen({ evidence }: { evidence: ClaimAEvidence }) {
  if (evidence.status === "unavailable") {
    return <EvidenceUnavailable reason={evidence.reason} />;
  }
  const { snapshot } = evidence;

  return (
    <div className="flex h-full flex-col justify-between px-[3.2cqw] pt-[3cqw] pb-[2.4cqw]">
      <header className="flex items-start justify-between gap-[2cqw]">
        <div className="flex flex-col gap-[0.6cqh]">
          <span className="text-[2.8cqw] font-medium text-white">Claim A · Sale timeline</span>
          <span className="font-mono text-[1.7cqw] text-neutral-500">
            sale {shortHex(snapshot.saleId, 8, 6)} · Sepolia → Creditcoin CC3
          </span>
        </div>
        <span className="rounded-full border border-white/10 px-[1.4cqw] py-[0.4cqw] font-mono text-[1.6cqw] text-neutral-400">
          {snapshot.evidenceLabel}
        </span>
      </header>
      <ol className="flex flex-col gap-[1.6cqh]">
        {snapshot.milestones.map((milestone) => (
          <MilestoneRow key={milestone.label} milestone={milestone} />
        ))}
      </ol>
      <footer className="font-mono text-[1.6cqw] text-neutral-600">
        Snapshot {utcTime(snapshot.snapshotAt)} · test tokens, no monetary value
      </footer>
    </div>
  );
}
