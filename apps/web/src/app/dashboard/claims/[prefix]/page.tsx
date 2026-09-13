import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ClaimCard } from "@/components/dashboard/claims/claim-card";
import { SellerPreflightCard } from "@/components/dashboard/preflight/seller-preflight-card";
import { dashboardRoutes } from "@/lib/dashboard-routes";
import { campaignClaims, loadCampaignLedger } from "@/lib/evidence/claim-ledger";

export const dynamicParams = false;

export function generateStaticParams() {
  return campaignClaims.map((claim) => ({ prefix: claim.prefix }));
}

export async function generateMetadata({
  params,
}: PageProps<"/dashboard/claims/[prefix]">): Promise<Metadata> {
  const { prefix } = await params;
  const entry = campaignClaims.find((claim) => claim.prefix === prefix);
  return { title: entry ? entry.name : "Claim" };
}

export default async function ClaimPage({ params }: PageProps<"/dashboard/claims/[prefix]">) {
  const { prefix } = await params;
  const claim = loadCampaignLedger()?.claims.find((entry) => entry.prefix === prefix);
  if (!claim) {
    notFound();
  }
  return (
    <section className="pb-8">
      <Link
        href={dashboardRoutes.claims}
        className="mb-6 inline-flex items-center gap-2 text-xs text-neutral-500 hover:text-white transition-colors"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
        All claims
      </Link>
      <div className="flex flex-col gap-4">
        <ClaimCard claim={claim} />
        {claim.fundingHash && (
          <SellerPreflightCard
            terms={claim.terms}
            fundingHash={claim.fundingHash}
            saleId={claim.saleId}
          />
        )}
      </div>
    </section>
  );
}
