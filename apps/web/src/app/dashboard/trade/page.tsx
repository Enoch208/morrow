import type { Metadata } from "next";
import { PageHeading } from "@/components/dashboard/page-heading";
import { TradeWorkspace } from "@/components/dashboard/trade/trade-workspace";
import { loadCampaignLedger } from "@/lib/evidence/claim-ledger";

export const metadata: Metadata = { title: "Trade" };

export default function TradePage() {
  const campaignClaimIds = [
    ...new Set(loadCampaignLedger()?.claims.map((claim) => claim.claimId) ?? []),
  ];
  return (
    <section>
      <PageHeading
        title="Sell a locked payout"
        description="Lock a payout on Sepolia, offer it to one buyer, get paid on Creditcoin once Attestcoin proves each step. Testnet only; tokens have no value."
      />
      <TradeWorkspace campaignClaimIds={campaignClaimIds} />
    </section>
  );
}
