import type { ReactNode } from "react";
import type { CampaignLedger } from "@/lib/evidence/claim-ledger";
import { DashboardHeader } from "./dashboard-header";
import { DashboardMobileNav } from "./dashboard-mobile-nav";
import { DashboardScrollArea } from "./dashboard-scroll-area";
import { DashboardSidebar } from "./dashboard-sidebar";
import { LiveChainProvider, type LiveClaimRef } from "./live/live-chain-provider";
import { WalletProvider } from "./wallet/wallet-provider";

export function DashboardShell({
  ledger,
  children,
}: {
  ledger: CampaignLedger;
  children: ReactNode;
}) {
  const refs: readonly LiveClaimRef[] = ledger.claims.map((claim) => ({
    prefix: claim.prefix,
    claimId: claim.claimId,
    round: claim.terms.round.toString(),
    saleId: claim.saleId,
  }));

  return (
    <WalletProvider>
      <LiveChainProvider claims={refs}>
        <div className="min-h-screen lg:h-screen bg-[#020202] p-3 lg:p-8 flex justify-center">
          <div className="bg-[#070707] w-full max-w-[1500px] lg:h-full rounded-[28px] lg:rounded-[40px] shadow-2xl shadow-black/50 overflow-hidden flex flex-col lg:flex-row relative border border-white/5">
            <DashboardSidebar claims={ledger.claims} />
            <main className="flex-1 flex flex-col min-w-0 lg:h-full bg-[#070707]">
              <DashboardHeader ledger={ledger} />
              <DashboardMobileNav />
              <DashboardScrollArea>{children}</DashboardScrollArea>
            </main>
          </div>
        </div>
      </LiveChainProvider>
    </WalletProvider>
  );
}
