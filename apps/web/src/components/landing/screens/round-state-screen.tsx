import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { shortHex, utcTime, utcDateTimeFromUnix } from "@/lib/format/display";
import { EvidenceUnavailable } from "./evidence-unavailable";

function StateRow({
  label,
  value,
  tone = "text-neutral-200",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-[2cqw] border-t border-white/5 pt-[1.6cqh]">
      <span className="text-[2.4cqw] text-neutral-500">{label}</span>
      <span className={`truncate font-mono text-[2.3cqw] ${tone}`}>{value}</span>
    </div>
  );
}

export function RoundStateScreen({ evidence }: { evidence: ClaimAEvidence }) {
  if (evidence.status === "unavailable") {
    return <EvidenceUnavailable reason={evidence.reason} />;
  }
  const { snapshot } = evidence;
  const assignedBeforeDeadline =
    BigInt(Math.floor(Date.parse(snapshot.assignedAt) / 1000)) < snapshot.terms.assignBefore;

  return (
    <div className="flex h-full flex-col justify-center gap-[5cqh] p-[4cqw]">
      <header className="flex items-center justify-between">
        <span className="text-[2.8cqw] text-neutral-400">
          Source round · claim #{snapshot.terms.claimId.toString()} / round{" "}
          {snapshot.terms.round.toString()}
        </span>
        <span className="rounded-md bg-green-500/10 px-[1.6cqw] py-[0.6cqw] font-mono text-[2.4cqw] font-medium text-green-500">
          ASSIGNED
        </span>
      </header>
      <div className="flex flex-col gap-[1.6cqh]">
        <StateRow label="Assign before" value={utcDateTimeFromUnix(snapshot.terms.assignBefore)} />
        <StateRow
          label="Assigned at"
          value={`${utcTime(snapshot.assignedAt)}${assignedBeforeDeadline ? " ✓" : ""}`}
          tone={assignedBeforeDeadline ? "text-green-500" : "text-neutral-200"}
        />
        <StateRow label="Beneficiary" value={`${shortHex(snapshot.currentBeneficiary)} buyer`} />
        <StateRow
          label="Cancel attempt"
          value={
            snapshot.cancelRefusalError
              ? `rejected · ${snapshot.cancelRefusalError}`
              : "not attempted"
          }
          tone="text-[#FF5A36]"
        />
      </div>
    </div>
  );
}
