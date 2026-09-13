import type { StaticImageData } from "next/image";
import Link from "next/link";
import { claimRoutes } from "@/lib/dashboard-routes";
import type { LedgerClaim } from "@/lib/evidence/claim-ledger";
import { saleAmounts } from "@/lib/format/sale-amounts";
import { CoverPhoto } from "../../landing/screens/cover-photo";
import { LiveStateChips } from "../live/live-state-chip";

export function ClaimPhotoCard({
  claim,
  image,
  headline,
}: {
  claim: LedgerClaim;
  image: StaticImageData;
  headline: string;
}) {
  const amounts = saleAmounts(claim.terms);

  return (
    <Link
      href={claimRoutes[claim.prefix]}
      className="col-span-1 h-[340px] relative rounded-2xl overflow-hidden group border border-white/5"
    >
      <CoverPhoto
        image={image}
        sizes="(min-width: 1024px) 25vw, 100vw"
        frameClassName=""
        motionClassName="transition-transform duration-700 group-hover:scale-105"
        imageClassName="opacity-50"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="relative z-20 p-6 flex flex-col justify-end h-full gap-3">
        <LiveStateChips prefix={claim.prefix} tone="photo" />
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
            {claim.name} · #{claim.claimId}
          </span>
          <h4 className="text-lg font-medium text-white mt-1">{headline}</h4>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">{amounts.faceValue} mSRC face</span>
          <span className="font-mono text-sm text-white">{amounts.grossPrice} mSET</span>
        </div>
      </div>
    </Link>
  );
}
