import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CampaignCheck } from "@/lib/evidence/campaign-checks";
import { utcDay, utcTime } from "@/lib/format/display";

export function SafetyChecks({ checks }: { checks: readonly CampaignCheck[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium text-white">Adversarial checks</h3>
      {checks.length === 0 ? (
        <p className="text-sm text-neutral-500">No adversarial checks are recorded yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {checks.map((check) => (
            <article
              key={check.title}
              className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-[#0a0a0a] p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                    {check.claim}
                  </span>
                  <h4 className="text-sm font-medium text-white">{check.title}</h4>
                </div>
                <HugeiconsIcon
                  icon={CheckmarkCircle02Icon}
                  size={20}
                  className="shrink-0 text-green-500"
                />
              </div>
              <p className="text-xs text-neutral-400">{check.expectation}</p>
              <div className="rounded-lg border border-[#FF5A36]/20 bg-[#FF5A36]/5 px-3 py-2 font-mono text-xs text-[#FF5A36]">
                Rejected · {check.actualError}
              </div>
              <div className="mt-auto flex flex-col gap-0.5 font-mono text-[11px] text-neutral-500">
                <span>{check.detail}</span>
                <span>
                  {utcDay(check.observedAt)} · {utcTime(check.observedAt)} · {check.evidenceKind}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
