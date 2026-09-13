import type { Metadata } from "next";
import { DeploymentList } from "@/components/dashboard/evidence/deployment-list";
import { SafetyChecks } from "@/components/dashboard/evidence/safety-checks";
import { PageHeading } from "@/components/dashboard/page-heading";
import { loadCampaignChecks } from "@/lib/evidence/campaign-checks";

export const metadata: Metadata = { title: "Evidence" };

export default function EvidencePage() {
  return (
    <section className="pb-8">
      <PageHeading
        title="Evidence"
        description="Adversarial checks run against the live contracts, and the deployments every number on this dashboard is read from."
      />
      <div className="flex flex-col gap-10">
        <SafetyChecks checks={loadCampaignChecks()} />
        <DeploymentList />
      </div>
    </section>
  );
}
