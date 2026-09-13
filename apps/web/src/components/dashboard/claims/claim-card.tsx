import type { LedgerClaim } from "@/lib/evidence/claim-ledger";
import { shortHex, utcDateTimeFromUnix } from "@/lib/format/display";
import { saleAmounts } from "@/lib/format/sale-amounts";
import { LiveStateChips } from "../live/live-state-chip";
import { ClaimNextSteps } from "./claim-next-steps";
import { ClaimTimeline } from "./claim-timeline";

export function ClaimCard({ claim }: { claim: LedgerClaim }) {
  const amounts = saleAmounts(claim.terms);
  const terms = [
    { label: "Face value", value: `${amounts.faceValue} mSRC` },
    { label: "Gross price", value: `${amounts.grossPrice} mSET` },
    ...(claim.outcome === "assignment"
      ? [
          { label: `Fee · ${claim.terms.feeBps.toString()} bps`, value: `${amounts.fee} mSET` },
          { label: "Seller net", value: `${amounts.sellerNet} mSET` },
        ]
      : [
          { label: "Fee charged", value: "0 mSET" },
          { label: "Buyer refund", value: `${amounts.grossPrice} mSET` },
        ]),
    { label: "Fund before", value: utcDateTimeFromUnix(claim.terms.fundBefore) },
    { label: "Assign before", value: utcDateTimeFromUnix(claim.terms.assignBefore) },
    { label: "Maturity", value: utcDateTimeFromUnix(claim.terms.maturity) },
    { label: "Sale id", value: shortHex(claim.saleId, 10, 6) },
  ];

  return (
    <article className="rounded-2xl border border-white/5 bg-[#0a0a0a] p-5 lg:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
            Claim #{claim.claimId} · round {claim.terms.round.toString()} · {claim.outcome} path
          </span>
          <h3 className="text-xl font-medium text-white mt-1">{claim.name}</h3>
        </div>
        <LiveStateChips prefix={claim.prefix} />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4 content-start">
          {terms.map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1">
              <dt className="text-[10px] uppercase tracking-widest text-neutral-500">{label}</dt>
              <dd className="font-mono text-xs text-neutral-100">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h4 className="text-xs font-medium text-neutral-400 mb-4">Evidence timeline</h4>
          <ClaimTimeline milestones={claim.milestones} />
        </div>
        <div>
          <h4 className="text-xs font-medium text-neutral-400 mb-4">Next steps · live</h4>
          <ClaimNextSteps prefix={claim.prefix} terms={claim.terms} />
        </div>
      </div>
    </article>
  );
}
