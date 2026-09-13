import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft01Icon,
  CheckmarkBadge01Icon,
  DashboardSquare01Icon,
  Folder01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import wordmark from "@/assets/morrow-wordmark.png";
import { claimRoutes, dashboardRoutes } from "@/lib/dashboard-routes";
import type { LedgerClaim } from "@/lib/evidence/claim-ledger";
import { SidebarSection } from "./sidebar-tree";

export function DashboardSidebar({ claims }: { claims: readonly LedgerClaim[] }) {
  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 h-full p-8 border-r border-white/5 bg-[#070707] overflow-y-auto no-scrollbar">
      <Link href="/" aria-label="Morrow home" className="flex items-center gap-2 mb-10 pl-2">
        <Image src={wordmark} alt="Morrow" className="h-[18px] w-auto" />
      </Link>

      <nav className="space-y-1 flex-1">
        <SidebarSection
          label="Overview"
          href={dashboardRoutes.overview}
          icon={DashboardSquare01Icon}
          items={[
            { label: "Live state", href: dashboardRoutes.overview },
            { label: "Your position", href: dashboardRoutes.position },
          ]}
        />
        <SidebarSection
          label="Claims"
          href={dashboardRoutes.claims}
          icon={Folder01Icon}
          nested
          items={claims.map((claim) => ({
            label: `${claim.name} · #${claim.claimId}`,
            href: claimRoutes[claim.prefix],
          }))}
        />
        <SidebarSection
          label="Proof Room"
          href={dashboardRoutes.evidence}
          icon={CheckmarkBadge01Icon}
          items={[]}
        />
      </nav>

      <div className="mt-auto pt-8 border-t border-white/5">
        <Link
          href="/"
          className="flex items-center gap-3 px-3 py-2 text-neutral-500 hover:text-white transition-colors w-full"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
          <span className="text-sm font-medium">Back to site</span>
        </Link>
      </div>
    </aside>
  );
}
