import { deployments } from "@/lib/chain/deployments";
import { addressUrl, chains, type ChainKey } from "@/lib/explorers";

const entries: readonly { name: string; role: string; chain: ChainKey; address: string }[] = [
  {
    name: "FundedPaymentVault",
    role: "Holds funded payouts, reservations and outcomes",
    chain: "sepolia",
    address: deployments.vault,
  },
  {
    name: "mSRC test token",
    role: "Source payout asset, six decimals",
    chain: "sepolia",
    address: deployments.sourceToken,
  },
  {
    name: "MorrowMarket",
    role: "Proof-gated escrow, credits and withdrawals for the campaign claims",
    chain: "cc3",
    address: deployments.market,
  },
  {
    name: "MorrowMarketV2",
    role: "Trade page market; proofs need 64 attested blocks on top and are recorded with verifyAndEmit",
    chain: "cc3",
    address: deployments.tradeMarket,
  },
  {
    name: "mSET test token",
    role: "Settlement asset, six decimals",
    chain: "cc3",
    address: deployments.settlementToken,
  },
];

export function DeploymentList() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-medium text-white">Deployments</h3>
      <ul className="flex flex-col divide-y divide-white/5 rounded-2xl border border-white/5 bg-[#0a0a0a] px-5">
        {entries.map((entry) => (
          <li
            key={entry.address}
            className="flex flex-col gap-2 py-4 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-white">{entry.name}</span>
              <span className="text-[11px] text-neutral-500">
                {chains[entry.chain].name} · {entry.role}
              </span>
            </div>
            <a
              href={addressUrl(entry.chain, entry.address)}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-neutral-400 hover:text-[#FF5A36] transition-colors break-all"
            >
              {entry.address} · {chains[entry.chain].explorer}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
