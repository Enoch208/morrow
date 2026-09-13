import { stateLanguage } from "@morrow/protocol";

export function EvidenceUnavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-[1.5cqh] p-[6cqw] text-center">
      <span className="text-[4cqw] font-medium text-neutral-200">
        {stateLanguage.EVIDENCE_UNAVAILABLE}
      </span>
      <span className="text-[2.6cqw] text-neutral-500">{reason}</span>
    </div>
  );
}
