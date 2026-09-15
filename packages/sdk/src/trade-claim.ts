import { getAddress } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { ConfigurationError } from "./environment.ts";

export const tradeFaceValueRaw = 10_000_000_000n;
export const tradePriceRaw = 9_410_000_000n;

export function createdClaimId(
  receipt: {
    readonly logs: readonly { address: string; topics: readonly string[]; data: string }[];
  },
  payer: string,
  context: Record<string, unknown>,
): bigint {
  const funded = receipt.logs
    .filter((log) => log.address.toLowerCase() === campaignContracts.vault.address.toLowerCase())
    .map((log) => contractInterfaces.vault.parseLog(log))
    .filter((parsed) => parsed?.name === "ClaimFunded");
  const event = funded[0];
  if (
    funded.length !== 1 ||
    !event ||
    getAddress(String(event.args[1])) !== getAddress(payer) ||
    getAddress(String(event.args[2])) !== campaignActors.SELLER ||
    event.args[4] !== tradeFaceValueRaw ||
    event.args[5] !== context.maturity
  )
    throw new ConfigurationError("Mined claim does not match the requested payout");
  return BigInt(String(event.args[0]));
}
