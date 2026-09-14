import { getAddress, zeroPadValue } from "ethers";
import type { JsonRpcProvider, Log } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import { withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { campaignContracts } from "./campaign-config.ts";
import { contractInterfaces, verifyCampaignContract } from "./contract-reads.ts";
import { decodeCanonicalTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

export const vaultDeploymentBlock = 11_691_828;
const logWindow = 40_000;

export interface WalletClaim {
  readonly claimId: bigint;
  readonly payer: string;
  readonly beneficiary: string;
  readonly faceValueRaw: bigint;
  readonly maturity: bigint;
  readonly fundingHash: string;
}

export interface WalletSale {
  readonly terms: SaleTerms;
  readonly saleId: string;
  readonly reservationHash: string;
  readonly outcome?: { readonly kind: "assign" | "cancel"; readonly hash: string };
  readonly redemptionHash?: string;
}

async function vaultLogs(rpc: JsonRpcProvider, topics: (string | null)[], to: number) {
  const logs: Log[] = [];
  for (let from = vaultDeploymentBlock; from <= to; from += logWindow) {
    logs.push(
      ...(await rpc.getLogs({
        address: campaignContracts.vault.address,
        topics,
        fromBlock: from,
        toBlock: Math.min(from + logWindow - 1, to),
      })),
    );
  }
  return logs;
}

function eventTopic(name: string): string {
  const event = contractInterfaces.vault.getEvent(name);
  if (!event) throw new ConfigurationError(`Missing vault event ${name}`);
  return event.topicHash;
}

export function decodeReservation(log: Log): { terms: SaleTerms; saleId: string } {
  const parsed = contractInterfaces.vault.parseLog(log);
  if (parsed?.name !== "SaleReserved") throw new ConfigurationError("Not a reservation log");
  const terms = decodeCanonicalTerms(String(parsed.args[4]));
  const saleId = saleIdentity(terms).saleId;
  if (saleId !== parsed.args[0])
    throw new ConfigurationError("Reservation terms do not match saleId");
  return { terms, saleId };
}

export async function readWalletActivity(wallet: string, options: BrowserActionOptions) {
  const address = getAddress(wallet);
  const topic = zeroPadValue(address, 32);
  return withBrowserAction(options, async ({ source }) => {
    const head = await source.getBlockNumber();
    await verifyCampaignContract(source, "vault", head);
    const funded = eventTopic("ClaimFunded");
    const [asPayer, asBeneficiary, reservations, assigned, cancelled, redeemed] = await Promise.all(
      [
        vaultLogs(source, [funded, null, topic], head),
        vaultLogs(source, [funded, null, null, topic], head),
        vaultLogs(source, [eventTopic("SaleReserved")], head),
        vaultLogs(source, [eventTopic("SaleAssigned")], head),
        vaultLogs(source, [eventTopic("SaleCancelled")], head),
        vaultLogs(source, [eventTopic("ClaimRedeemed")], head),
      ],
    );
    const claims = [...asPayer, ...asBeneficiary].map((log): WalletClaim => {
      const parsed = contractInterfaces.vault.parseLog(log);
      if (!parsed) throw new ConfigurationError("Unreadable claim log");
      return {
        claimId: BigInt(String(parsed.args[0])),
        payer: getAddress(String(parsed.args[1])),
        beneficiary: getAddress(String(parsed.args[2])),
        faceValueRaw: BigInt(String(parsed.args[4])),
        maturity: BigInt(String(parsed.args[5])),
        fundingHash: log.transactionHash,
      };
    });
    const outcomeFor = (saleId: string) => {
      const assign = assigned.find((log) => log.topics[1] === saleId);
      if (assign) return { kind: "assign", hash: assign.transactionHash } as const;
      const cancel = cancelled.find((log) => log.topics[1] === saleId);
      return cancel ? ({ kind: "cancel", hash: cancel.transactionHash } as const) : undefined;
    };
    const sales = reservations
      .map((log) => ({ log, ...decodeReservation(log) }))
      .filter(({ terms }) => terms.seller === address || terms.buyer === address)
      .map(({ log, terms, saleId }): WalletSale => {
        const outcome = outcomeFor(saleId);
        const redemption = redeemed.find(
          (entry) => BigInt(entry.topics[1] ?? "0x0") === terms.claimId,
        );
        return {
          terms,
          saleId,
          reservationHash: log.transactionHash,
          ...(outcome ? { outcome } : {}),
          ...(redemption ? { redemptionHash: redemption.transactionHash } : {}),
        };
      });
    const unique = new Map(claims.map((claim) => [claim.claimId, claim]));
    return { head, claims: [...unique.values()], sales };
  });
}
