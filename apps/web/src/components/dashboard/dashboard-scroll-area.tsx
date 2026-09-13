"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

export function DashboardScrollArea({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const area = useRef<HTMLDivElement>(null);

  useEffect(() => {
    area.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div
      ref={area}
      className="flex-1 min-h-0 px-5 pb-8 pt-6 lg:pt-0 lg:px-8 lg:overflow-y-auto no-scrollbar"
    >
      {children}
    </div>
  );
}
