"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { dashboardRoutes, isActiveRoute } from "@/lib/dashboard-routes";

const items = [
  { label: "Live state", href: dashboardRoutes.overview, exact: true },
  { label: "Position", href: dashboardRoutes.position, exact: true },
  { label: "Trade", href: dashboardRoutes.trade, exact: true },
  { label: "Claims", href: dashboardRoutes.claims, exact: false },
  { label: "Proof Room", href: dashboardRoutes.evidence, exact: true },
] as const;

export function DashboardMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden sticky top-0 z-30 flex gap-2 overflow-x-auto no-scrollbar border-y border-white/5 bg-[#070707]/95 px-5 py-3 backdrop-blur-md">
      {items.map((item) => {
        const active = isActiveRoute(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-white text-black" : "bg-white/[0.04] text-neutral-400 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
