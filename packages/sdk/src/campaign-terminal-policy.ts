import { campaignTerms } from "./campaign-config.ts";
import type { CampaignName } from "./campaign-config.ts";
import { ConfigurationError } from "./environment.ts";

export function assertTerminalTiming(
  name: CampaignName,
  action: "cancel" | "redeem" | "settle",
  timestamp: bigint,
  redeemed: boolean,
): void {
  const terms = campaignTerms(name, 1n);
  if (action === "cancel" && (name === "a" || timestamp < terms.assignBefore))
    throw new ConfigurationError("Cancellation not authorized at this time");
  if (action === "redeem" && timestamp < terms.maturity)
    throw new ConfigurationError("Approved maturity has not arrived");
  if (action === "settle" && (name !== "a" || timestamp < terms.maturity || !redeemed))
    throw new ConfigurationError("A proof must remain held until maturity and redemption");
}
