import type { StaticImageData } from "next/image";
import Link from "next/link";
import { claimRoutes } from "@/lib/dashboard-routes";
import type { LedgerClaim } from "@/lib/evidence/claim-ledger";
import { saleAmounts } from "@/lib/format/sale-amounts";
import { CoverPhoto } from "../../landing/screens/cover-photo";
import { LiveStateChips } from "../live/live-state-chip";

export function ClaimFeatureCard({ claim, image }: { claim: LedgerClaim; image: StaticImageData }) {
  const amounts = saleAmounts(claim.terms);
  const figures = [
    { label: "Face value", value: `${amounts.faceValue} mSRC` },
    { label: "Buyer paid", value: `${amounts.grossPrice} mSET` },
    { label: "Seller net", value: `${amounts.sellerNet} mSET` },
  ];

  return (
    <div className="col-span-1 md:col-span-2 relative h-[340px] rounded-2xl overflow-hidden group border border-white/5">
      <CoverPhoto
        image={image}
        sizes="(min-width: 1024px) 50vw, 100vw"
        preload
        frameClassName=""
        motionClassName="transition-transform duration-700 group-hover:scale-105"
        imageClassName="opacity-60"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
      <div className="relative z-20 p-6 lg:p-8 flex flex-col justify-end h-full gap-4">
        <LiveStateChips prefix={claim.prefix} tone="photo" />
        <div>
          <span className="text-xs font-semibold tracking-wider uppercase text-[#FF5A36]">
            {claim.name} · #{claim.claimId}
          </span>
          <h3 className="text-2xl lg:text-3xl font-medium tracking-tight text-white mt-2">
            Sold before unlock, settled after maturity
          </h3>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="flex flex-wrap gap-6">
            {figures.map(({ label, value }) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-widest text-neutral-400">{label}</dt>
                <dd className="font-mono text-sm text-white mt-1">{value}</dd>
              </div>
            ))}
          </dl>
          <Link
            href={claimRoutes[claim.prefix]}
            className="px-5 py-2.5 bg-white text-black rounded-full text-xs font-medium transition-colors hover:bg-neutral-200"
          >
            Open timeline
          </Link>
        </div>
      </div>
    </div>
  );
}
