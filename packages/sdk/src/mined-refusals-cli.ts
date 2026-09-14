import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ProofEnvelope } from "@morrow/protocol";
import { campaignContext } from "./campaign-chain.ts";
import { campaignTerms } from "./campaign-config.ts";
import { campaignRecord, campaignRecords } from "./campaign-log.ts";
import { buildCampaignProof } from "./campaign-proof.ts";
import { c5Terms } from "./c5-config.ts";
import { c5ClaimId, c5Records } from "./c5-log.ts";
import { loadC5Proof } from "./c5-proof.ts";
import { c5RefusalCall } from "./c5-refusal.ts";
import { saleIdentity } from "./canonical.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { ConfigurationError, provider, repositoryRoot } from "./environment.ts";
import { parseProof, verifyNativeProof } from "./proof.ts";
import { recordMinedRefusal } from "./mined-refusal-log.ts";
import { submitMinedRefusal, successfulProofGas } from "./mined-refusal-chain.ts";

const broadcast = process.argv.includes("--broadcast");
const continuityReason = "Continuity proof does not match attestation or checkpoint";

function string(value: unknown): string {
  if (typeof value !== "string") throw new ConfigurationError("Missing evidence string");
  return value;
}

async function staleProof(): Promise<{ proof: ProofEnvelope; proofHash: string }> {
  const row = await campaignRecord("wrong-sale-proof", "rejection-verified");
  const reserve = await campaignRecord("b-reserve", "mined");
  const path = string(row.proofPath);
  if (!/^evidence\/campaign\/[a-z0-9-]+\.json$/.test(path))
    throw new ConfigurationError("Invalid stale proof path");
  const text = await readFile(`${repositoryRoot}evidence/campaign/${basename(path)}`, "utf8");
  const expectedHash = string(row.proofHash);
  if (createHash("sha256").update(text).digest("hex") !== expectedHash)
    throw new ConfigurationError("Stale proof archive hash mismatch");
  return {
    proof: parseProof(JSON.parse(text) as unknown, string(reserve.transactionHash)),
    proofHash: expectedHash,
  };
}

const context = campaignContext();
let fallback: ReturnType<typeof provider> | null = null;
try {
  const buyer = context.wallet("BUYER", context.destination);
  const reserveRecord = await campaignRecord("a-reserve", "mined");
  const reserveHash = string(reserveRecord.transactionHash);
  let source = context.source;
  if (!(await source.getTransactionReceipt(reserveHash))) {
    fallback = provider("https://sepolia.gateway.tenderly.co");
    if (!(await fallback.getTransactionReceipt(reserveHash)))
      throw new ConfigurationError(
        "Neither configured source RPC nor fallback has campaign receipt",
      );
    source = fallback;
  }
  const proofGas = [
    ...successfulProofGas(await campaignRecords()),
    ...successfulProofGas(await c5Records()),
  ];
  const aTerms = campaignTerms("a", 2n);
  const aIdentity = saleIdentity(aTerms);
  const a = await buildCampaignProof(source, context.destination, "a", "reserve");
  await submitMinedRefusal(
    context.destination,
    buyer,
    {
      action: "mined-replay",
      expected: "SaleAlreadyExists",
      calldata: contractInterfaces.market.encodeFunctionData("fundReservation", [
        a.proof,
        a.logIndex,
        aTerms,
      ]),
      proofHash: a.proofHash,
      proofKind: "current",
      saleIds: [aIdentity.saleId],
      eventKeys: [a.eventKey],
    },
    proofGas,
    broadcast,
  );
  const b = await buildCampaignProof(source, context.destination, "b", "reserve");
  await submitMinedRefusal(
    context.destination,
    buyer,
    {
      action: "mined-wrong-sale",
      expected: "SaleIdMismatch",
      calldata: contractInterfaces.market.encodeFunctionData("fundReservation", [
        b.proof,
        b.logIndex,
        aTerms,
      ]),
      proofHash: b.proofHash,
      proofKind: "current",
      saleIds: [aIdentity.saleId, b.identity.saleId],
      eventKeys: [b.eventKey],
    },
    proofGas,
    broadcast,
  );
  const c5Claim = await c5ClaimId();
  const old = await loadC5Proof(source, context.destination, 1n, "cancel");
  const later = saleIdentity(c5Terms(c5Claim, 2n));
  await submitMinedRefusal(
    context.destination,
    buyer,
    {
      action: "mined-old-round",
      expected: "SaleNotBound",
      calldata: c5RefusalCall(old.proof, old.logIndex, later.saleId),
      proofHash: old.proofHash,
      proofKind: "current",
      saleIds: [later.saleId],
      eventKeys: [old.eventKey],
    },
    proofGas,
    broadcast,
  );
  const stale = await staleProof();
  await verifyNativeProof(context.destination, stale.proof).then(
    () => {
      throw new ConfigurationError("Archived proof unexpectedly remains current");
    },
    () => undefined,
  );
  await submitMinedRefusal(
    context.destination,
    buyer,
    {
      action: "mined-stale-proof",
      expected: continuityReason,
      calldata: contractInterfaces.market.encodeFunctionData("fundReservation", [
        stale.proof,
        0n,
        aTerms,
      ]),
      proofHash: stale.proofHash,
      proofKind: "stale",
      saleIds: [aIdentity.saleId],
      eventKeys: [],
    },
    proofGas,
    broadcast,
  );
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown mined-refusal failure";
  await recordMinedRefusal({ state: "blocked", evidenceKind: "blocked", message });
  process.stderr.write(message + "\n");
  process.exitCode = 1;
} finally {
  fallback?.destroy();
  context.close();
}
