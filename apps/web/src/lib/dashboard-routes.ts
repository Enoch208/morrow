import type { CampaignPrefix } from "@/lib/evidence/claim-ledger";

export const dashboardRoutes = {
  overview: "/dashboard",
  position: "/dashboard/position",
  trade: "/dashboard/trade",
  claims: "/dashboard/claims",
  evidence: "/dashboard/evidence",
} as const;

export const claimRoutes = {
  gate: "/dashboard/claims/gate",
  a: "/dashboard/claims/a",
  b: "/dashboard/claims/b",
  c: "/dashboard/claims/c",
} as const satisfies Record<CampaignPrefix, string>;

export type DashboardHref =
  | (typeof dashboardRoutes)[keyof typeof dashboardRoutes]
  | (typeof claimRoutes)[keyof typeof claimRoutes];

export function isActiveRoute(pathname: string, route: string, exact: boolean): boolean {
  return exact ? pathname === route : pathname === route || pathname.startsWith(`${route}/`);
}
