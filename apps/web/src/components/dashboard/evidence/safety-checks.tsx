import { CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CampaignCheck, CampaignChecks, PendingCheck } from "@/lib/evidence/campaign-checks";
import { utcDay, utcTime } from "@/lib/format/display";
import { AttackReplay } from "./attack-replay";

function CheckHeader({
  claim,
  title,
  pending,
}: {
  claim: string;
  title: string;
  pending: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
          {claim}
        </span>
        <h4 className="text-sm font-medium text-white">{title}</h4>
      </div>
      <HugeiconsIcon
        icon={pending ? Clock01Icon : CheckmarkCircle02Icon}
        size={20}
        className={`shrink-0 ${pending ? "text-neutral-500" : "text-green-500"}`}
      />
    </div>
  );
}

function RecordedCheck({ check }: { check: CampaignCheck }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5">
      <CheckHeader claim={check.claim} title={check.title} pending={false} />
      <p className="text-xs text-neutral-400">{check.expectation}</p>
      <div className="rounded-lg border border-[#FF5A36]/20 bg-[#FF5A36]/5 px-3 py-2 font-mono text-xs text-[#FF5A36]">
        Rejected · {check.actualError}
      </div>
      {check.replay && <AttackReplay replay={check.replay} expected={check.actualError} />}
      <div className="mt-auto flex flex-col gap-0.5 font-mono text-[11px] text-neutral-500">
        <span>{check.detail}</span>
        <span>
          {utcDay(check.observedAt)} · {utcTime(check.observedAt)} · {check.evidenceKind}
        </span>
      </div>
    </article>
  );
}

function PendingCard({ check }: { check: PendingCheck }) {
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-5">
      <CheckHeader claim={check.claim} title={check.title} pending />
      <p className="text-xs text-neutral-400">{check.expectation}</p>
      <div className="rounded-lg border border-white/10 px-3 py-2 font-mono text-xs text-neutral-400">
        Pending · not yet recorded
      </div>
      <span className="mt-auto font-mono text-[11px] text-neutral-500">{check.pendingNote}</span>
    </article>
  );
}

export function SafetyChecks({ checks }: { checks: CampaignChecks }) {
  const empty = checks.recorded.length === 0 && checks.pending.length === 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-medium text-white">What Morrow refuses</h3>
        <p className="text-xs text-neutral-500">
          Attacks attempted against the live contracts. Replay each one at its recorded block, or
          against the latest block, straight from this browser.
        </p>
      </div>
      {empty ? (
        <p className="text-sm text-neutral-500">No adversarial checks are recorded yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {checks.recorded.map((check) => (
            <RecordedCheck key={check.title} check={check} />
          ))}
          {checks.pending.map((check) => (
            <PendingCard key={check.title} check={check} />
          ))}
        </div>
      )}
    </div>
  );
}
