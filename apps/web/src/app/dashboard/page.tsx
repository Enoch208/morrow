import { notFound } from "next/navigation";
import { OverviewSection } from "@/components/dashboard/overview/overview-section";
import { loadCampaignLedger } from "@/lib/evidence/claim-ledger";

export default function DashboardOverviewPage() {
  const ledger = loadCampaignLedger();
  if (!ledger) {
    notFound();
  }
  return <OverviewSection ledger={ledger} />;
}
