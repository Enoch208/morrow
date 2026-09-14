import type { Metadata } from "next";
import { LiveHealthPanel } from "@/components/dashboard/evidence/live-health-panel";
import { loadPublicHealthProofs } from "@/lib/evidence/health-proofs";
import { AttestationFrontierPanel } from "@/components/dashboard/attestation/attestation-frontier";
import { ActorDisclosure } from "@/components/dashboard/evidence/actor-disclosure";
import { CanonicalSale } from "@/components/dashboard/evidence/canonical-sale";
import { DeploymentList } from "@/components/dashboard/evidence/deployment-list";
import { SameBytesPanel } from "@/components/dashboard/evidence/same-bytes-panel";
import { SafetyChecks } from "@/components/dashboard/evidence/safety-checks";
import { VerifyYourself } from "@/components/dashboard/evidence/verify-yourself";
import { WriteSurfacePanel } from "@/components/dashboard/evidence/write-surface-panel";
import { PageHeading } from "@/components/dashboard/page-heading";
import { loadCampaignChecks } from "@/lib/evidence/campaign-checks";
import { loadCampaignLedger } from "@/lib/evidence/claim-ledger";
import { loadSameBytesEvidence } from "@/lib/evidence/same-bytes";

export const metadata: Metadata = { title: "Proof Room" };

export default function ProofRoomPage() {
  const sameBytes = loadSameBytesEvidence();
  const canonical = loadCampaignLedger()?.claims.find((claim) => claim.prefix === "a");

  return (
    <section className="pb-8">
      <PageHeading
        title="Proof Room"
        description="Every claim Morrow makes, next to the transaction, proof or live read that backs it. Nothing here is a screenshot: re-run the checks from this browser."
      />
      <div className="flex flex-col gap-10">
        <LiveHealthPanel proofs={loadPublicHealthProofs()} />
        <VerifyYourself />
        {canonical && <CanonicalSale claim={canonical} />}
        <ActorDisclosure />
        <SafetyChecks checks={loadCampaignChecks()} />
        {sameBytes && <SameBytesPanel evidence={sameBytes} />}
        <WriteSurfacePanel />
        <AttestationFrontierPanel />
        <DeploymentList />
      </div>
    </section>
  );
}
