import { spawnSync } from "node:child_process";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError, integer, root, tuple } from "./checker-rpc.ts";
import { referenceIdentity } from "./index.ts";
import { record, string, number, storeEvidence } from "./evidence-files.ts";
import {
  campaignJournal,
  deploymentEvidence,
  latestIndependentCheck,
  proofEvidence,
  transactionEvidence,
} from "./manifest-records.ts";
import { applicationInterfaces, snapshots } from "./manifest-chain.ts";
import { validateManifest } from "./manifest-validation.ts";
import type { CampaignManifest } from "./manifest-types.ts";

export async function buildManifest(
  name: CampaignManifest["campaignId"],
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
): Promise<CampaignManifest> {
  const rows = await campaignJournal(name);
  const reservation = rows.find(
    (row) => row.action === `${name}-reserve` && row.state === "reservation-verified",
  );
  const funded = rows.find((row) => row.action === `${name}-fund` && row.state === "mined");
  if (!reservation || !funded)
    throw new EvidenceError("Campaign lacks verified reservation and mined funding");
  const terms = Object.fromEntries(
    Object.entries(record(reservation.terms)).map(([key, value]) => [key, string(value)]),
  );
  const identity = referenceIdentity(terms);
  const states = await snapshots(source, destination, terms, identity.saleId);
  const sourceState = states.find((state) => state.chainId === "11155111");
  const destinationState = states.find((state) => state.chainId === "102031");
  const claimRaw = sourceState?.reads.find((read) => read.method === "getClaim")?.raw;
  const roundRaw = sourceState?.reads.find((read) => read.method === "getRound")?.raw;
  const saleRaw = destinationState?.reads.find((read) => read.method === "getSale")?.raw;
  if (!claimRaw || !roundRaw || !saleRaw)
    throw new EvidenceError("Missing current source/destination state");
  const claim = tuple(applicationInterfaces.vault.decodeFunctionResult("getClaim", claimRaw)[0]);
  const sourceRoundState = Number(
    integer(tuple(applicationInterfaces.vault.decodeFunctionResult("getRound", roundRaw)[0])[1]),
  );
  const destinationSaleState = Number(
    integer(tuple(applicationInterfaces.market.decodeFunctionResult("getSale", saleRaw)[0])[1]),
  );
  if (typeof claim[8] !== "boolean") throw new EvidenceError("Invalid source redemption flag");
  const commit = spawnSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
  });
  if (commit.error) throw commit.error;
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
    timeout: 5000,
  });
  if (status.error) throw status.error;
  if (status.status !== 0) throw new EvidenceError("Cannot establish working-tree provenance");
  const implementationCommit =
    commit.status === 0 && status.stdout.trim() === "" ? commit.stdout.trim() : null;
  const commitBlocker =
    implementationCommit !== null
      ? null
      : commit.status === 0
        ? "Working tree is not a clean pinned commit"
        : "No repository commit exists";
  const transactions = await transactionEvidence(rows);
  const independentChecker = await latestIndependentCheck(string(funded.transactionHash));
  const unresolvedFacts = [
    "Full pinned-release verification is incomplete",
    "Historical funding checks do not establish current ownership",
    "Original bounded reference model unavailable",
  ];
  if (commitBlocker) unresolvedFacts.push(commitBlocker);
  if (destinationSaleState === 1)
    unresolvedFacts.push("Destination outcome remains BOUND; authentic terminal proof pending");
  if (!claim[8]) unresolvedFacts.push("Source redemption has not occurred");
  if (!independentChecker) unresolvedFacts.push("Independent funding checker report unavailable");
  const manifest: CampaignManifest = {
    schemaVersion: 1,
    evidenceKind: "live-read-verified",
    campaignId: name,
    generatedAt: new Date().toISOString(),
    implementationCommit,
    commitBlocker,
    networks: {
      sourceEvmChainId: "11155111",
      destinationEvmChainId: "102031",
      attestcoinChainKey: "1",
    },
    deployments: await deploymentEvidence(),
    tokens: [
      { address: string(terms.sourceToken), chainId: "11155111", decimals: 6, testToken: true },
      { address: string(terms.settlementToken), chainId: "102031", decimals: 6, testToken: true },
    ],
    terms,
    identity,
    transactions,
    proofs: await proofEvidence(rows),
    snapshots: states,
    timeline: await storeEvidence(rows),
    stateHistory: await Promise.all(
      rows
        .filter(
          (row) =>
            typeof row.state === "string" &&
            row.state.endsWith("-verified") &&
            row.state !== "native-verified",
        )
        .map(storeEvidence),
    ),
    withdrawals: transactions.filter((transaction) => transaction.action.includes("withdraw")),
    phaseTimings: rows
      .filter((row) => row.state === "attestation-observed" || row.state === "native-verified")
      .map((row) => ({
        action: string(row.action),
        observedAt: string(row.observedAt),
        inclusionToObservedMs:
          row.inclusionToObservedMs === undefined ? null : number(row.inclusionToObservedMs),
        proofConstructionMs:
          row.proofConstructionMs === undefined ? null : number(row.proofConstructionMs),
      })),
    failures: rows
      .filter((row) => row.state === "blocked")
      .map((row) => ({
        action: string(row.action),
        observedAt: string(row.observedAt),
        error: string(row.error),
      })),
    expectedOutcome: name === "a" ? "assigned-and-redeemed" : "cancelled-refunded-and-redeemed",
    actualOutcome: { sourceRoundState, destinationState: destinationSaleState, redeemed: claim[8] },
    independentChecker,
    unresolvedFacts,
  };
  return validateManifest(manifest);
}
