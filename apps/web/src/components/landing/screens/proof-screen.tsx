import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { groupedNumber, shortHex } from "@/lib/format/display";
import { EvidenceUnavailable } from "./evidence-unavailable";

export function ProofScreen({ evidence }: { evidence: ClaimAEvidence }) {
  if (evidence.status === "unavailable") {
    return <EvidenceUnavailable reason={evidence.reason} />;
  }
  const { proof, wrongSaleError } = evidence.snapshot;
  const fields = [
    { label: "Chain key", value: `${String(proof.chainKey)} · Sepolia` },
    { label: "Source header", value: groupedNumber(proof.headerNumber) },
    { label: "Tx index", value: `${String(proof.txIndex)} · native-derived` },
    { label: "Proof hash", value: shortHex(proof.proofHash, 10, 6) },
    { label: "Built in", value: `${groupedNumber(proof.constructionMs)} ms` },
  ];

  return (
    <div className="flex h-full flex-col justify-between p-[3.4cqw]">
      <header className="flex items-center justify-between">
        <span className="text-[3cqw] font-medium text-white">Reservation proof</span>
        <span className="rounded-md bg-green-500/10 px-[1.6cqw] py-[0.5cqw] font-mono text-[2.4cqw] text-green-500">
          VERIFIED
        </span>
      </header>
      <dl className="grid grid-cols-2 gap-x-[3cqw] gap-y-[2.4cqh]">
        {fields.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-[0.4cqh]">
            <dt className="text-[2.2cqw] text-neutral-500">{label}</dt>
            <dd className="truncate font-mono text-[2.5cqw] text-neutral-100">{value}</dd>
          </div>
        ))}
      </dl>
      <footer className="rounded-md border border-[#FF5A36]/20 bg-[#FF5A36]/5 px-[2cqw] py-[1.2cqh] font-mono text-[2.2cqw] text-[#FF5A36]">
        Same bytes on another sale → {wrongSaleError ?? "not tested"}
      </footer>
    </div>
  );
}
