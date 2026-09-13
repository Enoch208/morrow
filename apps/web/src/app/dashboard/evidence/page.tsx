import type { Metadata } from "next";
import { AttestationFrontierPanel } from "@/components/dashboard/attestation/attestation-frontier";
import { DeploymentList } from "@/components/dashboard/evidence/deployment-list";
import { SameBytesPanel } from "@/components/dashboard/evidence/same-bytes-panel";
import { SafetyChecks } from "@/components/dashboard/evidence/safety-checks";
import { PageHeading } from "@/components/dashboard/page-heading";
import { loadCampaignChecks } from "@/lib/evidence/campaign-checks";
import { loadSameBytesEvidence } from "@/lib/evidence/same-bytes";

export const metadata: Metadata = { title: "Evidence" };

export default function EvidencePage() {
  const sameBytes = loadSameBytesEvidence();

  return (
    <section className="pb-8">
      <PageHeading
        title="Evidence"
        description="The live attestation frontier, adversarial checks you can re-run yourself, and the deployments every number on this dashboard is read from."
      />
      <div className="flex flex-col gap-10">
        {sameBytes && <SameBytesPanel evidence={sameBytes} />}
        <AttestationFrontierPanel />
        <SafetyChecks checks={loadCampaignChecks()} />
        <DeploymentList />
      </div>
    </section>
  );
}
