"use client";

import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveRoute, type DashboardHref } from "@/lib/dashboard-routes";

export interface TreeChild {
  readonly label: string;
  readonly href: DashboardHref;
}

export function SidebarSection({
  label,
  href,
  icon,
  items,
  nested = false,
}: {
  label: string;
  href: DashboardHref;
  icon: IconSvgElement;
  items: readonly TreeChild[];
  nested?: boolean;
}) {
  const pathname = usePathname();
  const sectionActive =
    isActiveRoute(pathname, href, !nested) || items.some((item) => item.href === pathname);

  return (
    <div className="pt-2">
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
          sectionActive
            ? "bg-white/[0.06] text-white"
            : "text-neutral-500 hover:text-white hover:bg-white/[0.03]"
        }`}
      >
        <HugeiconsIcon icon={icon} size={16} className={sectionActive ? "text-[#FF5A36]" : ""} />
        <span className="text-sm font-medium">{label}</span>
      </Link>
      {items.length > 0 && (
        <div className="relative ml-5 pl-4 pt-1 space-y-1">
          <div className="absolute left-[3px] top-0 bottom-4 w-px bg-white/10" />
          {items.map((item, index) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 px-3 py-2 transition-colors rounded-lg ${
                  active ? "text-white" : "text-neutral-500 hover:text-white"
                }`}
              >
                <div
                  className={`w-4 border-white/10 rounded-bl-xl border-b border-l absolute left-[-13px] ${
                    index === 0 ? "h-[50%] top-0" : "h-[100%] top-[-50%]"
                  }`}
                />
                {active && <span className="absolute left-0 h-1 w-1 rounded-full bg-[#FF5A36]" />}
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
