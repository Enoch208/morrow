import type { Metadata } from "next";
import { stateLanguage } from "@morrow/protocol";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { loadCampaignLedger } from "@/lib/evidence/claim-ledger";

export const metadata: Metadata = {
  title: { default: "Dashboard · Morrow", template: "%s · Morrow" },
  description: "Live state, evidence and positions for Morrow's testnet sale campaign.",
};

export default function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const ledger = loadCampaignLedger();

  if (!ledger || ledger.claims.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020202] p-6 text-center">
        <div className="flex flex-col gap-2">
          <span className="text-xl text-white">{stateLanguage.EVIDENCE_UNAVAILABLE}</span>
          <span className="text-sm text-neutral-500">No campaign evidence log was found.</span>
        </div>
      </div>
    );
  }

  return <DashboardShell ledger={ledger}>{children}</DashboardShell>;
}
