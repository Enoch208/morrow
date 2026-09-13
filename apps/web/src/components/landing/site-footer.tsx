import { addressUrl, chains, repositoryUrl } from "@/lib/explorers";
import { SiteLogo } from "./site-logo";

const deployments = {
  vault: "0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583",
  market: "0x7c3310280083eE63e32427D11d0A7C2CAf584474",
} as const;

interface FooterLink {
  readonly label: string;
  readonly href: string;
  readonly external?: boolean;
}

const footerColumns: readonly { heading: string; links: readonly FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Safety", href: "#safety" },
      { label: "Economics", href: "#economics" },
    ],
  },
  {
    heading: "Verify",
    links: [
      { label: "Proof evidence", href: "#verify" },
      {
        label: `Vault on ${chains.sepolia.explorer}`,
        href: addressUrl("sepolia", deployments.vault),
        external: true,
      },
      {
        label: `Market on ${chains.cc3.explorer}`,
        href: addressUrl("cc3", deployments.market),
        external: true,
      },
    ],
  },
  {
    heading: "Build",
    links: [
      { label: "GitHub", href: repositoryUrl, external: true },
      { label: "Attestcoin", href: "https://docs.attestcoin.org/", external: true },
      { label: "Creditcoin", href: "https://creditcoin.org/", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#020202] pb-12 pt-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mb-16 flex flex-col justify-between gap-12 md:flex-row">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-4">
              <SiteLogo />
            </div>
            <p className="text-xs leading-relaxed text-neutral-500">
              Morrow creates secondary liquidity for already-funded scheduled payouts. The claim
              stays on its source chain, purchase capital stays on Creditcoin, and only
              authenticated proof crosses.
            </p>
          </div>

          <div className="flex flex-wrap gap-x-16 gap-y-10 text-xs text-neutral-500">
            {footerColumns.map(({ heading, links }) => (
              <div key={heading} className="flex flex-col gap-4">
                <span className="font-semibold text-white">{heading}</span>
                {links.map(({ label, href, external }) => (
                  <a
                    key={label}
                    href={href}
                    className="hover:text-white"
                    {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    {label}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-white/5 pt-8">
          <p className="text-[10px] text-neutral-600">© 2026 Morrow</p>
          <div className="flex gap-4 items-center">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[10px] text-neutral-500">
              Testnet prototype · test tokens have no monetary value
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
