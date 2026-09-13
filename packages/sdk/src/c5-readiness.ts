import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
import { decodedInteger } from "./decoded-state.ts";
import { c5Times } from "./c5-config.ts";
import { recordC5 } from "./c5-log.ts";
import { readNative } from "./native.ts";
import { proverEndpoints } from "./environment.ts";
import { ConfigurationError } from "./errors.ts";
import type { C5Context } from "./c5-submit.ts";

export async function c5Readiness(context: C5Context): Promise<void> {
  if (BigInt(Math.floor(Date.now() / 1000)) > c5Times.readiness)
    throw new ConfigurationError("C5 readiness cutoff elapsed");
  const [source, destination] = await Promise.all([
    context.source.getBlock("latest"),
    context.destination.getBlock("finalized"),
  ]);
  if (!source?.hash || !destination?.hash)
    throw new ConfigurationError("C5 canonical blocks unavailable");
  const now = Math.floor(Date.now() / 1000);
  for (const block of [source, destination])
    if (now - block.timestamp > 120 || block.timestamp - now > 30)
      throw new ConfigurationError("C5 readiness chain timestamp stale");
  await Promise.all(
    Object.keys(campaignContracts).map(async (name) => {
      const key = name as keyof typeof campaignContracts;
      const sourceSide = campaignContracts[key].chainId === 11155111n;
      await verifyCampaignContract(
        sourceSide ? context.source : context.destination,
        key,
        sourceSide ? source.number : destination.number,
      );
    }),
  );
  const frontier = await readNative(
    context.destination,
    "chainInfo",
    "get_latest_attestation_height_and_hash",
    [1],
    destination.number,
  );
  const endpoints = await Promise.all(
    proverEndpoints.map(async (endpoint) => {
      const response = await fetch(`${endpoint}/api/v1/attested-height/1`, {
        signal: AbortSignal.timeout(12000),
      });
      const body = await response.text();
      return { endpoint, status: response.status, body, available: response.ok };
    }),
  );
  const balances = await Promise.all(
    Object.entries(campaignActors).map(async ([role, address]) => {
      const [
        sourceGas,
        destinationGas,
        sourcePending,
        sourceLatest,
        destinationPending,
        destinationLatest,
      ] = await Promise.all([
        context.source.getBalance(address, source.number),
        context.destination.getBalance(address, destination.number),
        context.source.getTransactionCount(address, "pending"),
        context.source.getTransactionCount(address, "latest"),
        context.destination.getTransactionCount(address, "pending"),
        context.destination.getTransactionCount(address, "latest"),
      ]);
      if (
        sourceGas <= 0n ||
        destinationGas <= 0n ||
        sourcePending !== sourceLatest ||
        destinationPending !== destinationLatest
      )
        throw new ConfigurationError(`C5 ${role} gas or pending-nonce readiness failed`);
      return { role, address, sourceGas, destinationGas, sourceLatest, destinationLatest };
    }),
  );
  const [sourceFunds, buyerFunds, sourceAllowance, buyerAllowance, backing, liabilities] =
    await Promise.all([
      campaignRead(
        context.source,
        "sourceToken",
        "balanceOf",
        [campaignActors.PAYER],
        source.number,
      ),
      campaignRead(
        context.destination,
        "settlementToken",
        "balanceOf",
        [campaignActors.BUYER],
        destination.number,
      ),
      campaignRead(
        context.source,
        "sourceToken",
        "allowance",
        [campaignActors.PAYER, campaignContracts.vault.address],
        source.number,
      ),
      campaignRead(
        context.destination,
        "settlementToken",
        "allowance",
        [campaignActors.BUYER, campaignContracts.market.address],
        destination.number,
      ),
      campaignRead(context.source, "vault", "totalBacking", [], source.number),
      campaignRead(context.destination, "market", "totalLiabilities", [], destination.number),
    ]);
  const ready =
    endpoints.every((endpoint) => endpoint.available) &&
    decodedInteger(sourceFunds.decoded[0]) >= 10000000n &&
    decodedInteger(buyerFunds.decoded[0]) >= 9410000n &&
    decodedInteger(backing.decoded[0]) === 0n &&
    decodedInteger(liabilities.decoded[0]) === 0n;
  if (
    (await context.source.getBlock(source.number))?.hash !== source.hash ||
    (await context.destination.getBlock(destination.number))?.hash !== destination.hash
  )
    throw new ConfigurationError("C5 readiness snapshot reorganized");
  await recordC5({
    action: "c5-readiness",
    state: ready ? "ready" : "blocked",
    evidenceKind: ready ? "live-read-verified" : "blocked",
    sourceBlock: source.number,
    sourceHash: source.hash,
    sourceTimestamp: source.timestamp,
    destinationBlock: destination.number,
    destinationHash: destination.hash,
    destinationTimestamp: destination.timestamp,
    frontier,
    endpoints,
    balances,
    sourceFunds,
    buyerFunds,
    sourceAllowance,
    buyerAllowance,
    backing,
    liabilities,
    signingEnabled: false,
  });
  if (!ready) throw new ConfigurationError("C5 funding or prover readiness unavailable");
}
