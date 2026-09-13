import { Ajv } from "ajv";
import { manifestSchema } from "./manifest-schema.ts";
import type { CampaignManifest, ArtifactReference } from "./manifest-types.ts";
import { safeArtifactPath } from "./evidence-files.ts";
import { referenceEventKey, referenceIdentity } from "./index.ts";
import { EvidenceError, pins } from "./checker-rpc.ts";

const validate = new Ajv({ strict: true, allErrors: true }).compile<CampaignManifest>(
  manifestSchema,
);

export function manifestArtifacts(manifest: CampaignManifest): readonly ArtifactReference[] {
  return [
    manifest.timeline,
    ...manifest.deployments.map((item) => item.artifact),
    ...manifest.transactions.map((item) => item.receipt),
    ...manifest.proofs.map((item) => item.artifact),
    ...manifest.stateHistory,
    ...manifest.withdrawals.map((item) => item.receipt),
    ...(manifest.independentChecker ? [manifest.independentChecker] : []),
  ];
}

export function validateManifest(value: unknown): CampaignManifest {
  if (!validate(value)) throw new EvidenceError("Campaign manifest schema rejected input");
  const manifest = value;
  const identity = referenceIdentity(manifest.terms);
  for (const key of ["encodedTerms", "termsHash", "claimKey", "saleId"] as const)
    if (manifest.identity[key] !== identity[key])
      throw new EvidenceError("Manifest canonical identity mismatch");
  if ((manifest.implementationCommit === null) !== (manifest.commitBlocker !== null))
    throw new EvidenceError("Unknown implementation commit needs an explicit blocker");
  if (!Number.isFinite(Date.parse(manifest.generatedAt)))
    throw new EvidenceError("Invalid manifest timestamp");
  if (
    new Set(manifest.deployments.map((deployment) => deployment.role)).size !== 4 ||
    new Set(manifest.snapshots.map((snapshot) => snapshot.chainId)).size !== 2
  )
    throw new EvidenceError("Missing unique deployment or chain snapshot");
  if (
    manifest.terms.sourceVault !== pins.vault ||
    manifest.terms.destinationMarket !== pins.market ||
    manifest.terms.sourceToken !== pins.sourceToken ||
    manifest.terms.settlementToken !== pins.token ||
    manifest.terms.sourceEvmChainId !== "11155111" ||
    manifest.terms.destinationEvmChainId !== "102031"
  )
    throw new EvidenceError("Manifest terms differ from pinned deployment domains");
  for (const reference of manifestArtifacts(manifest)) safeArtifactPath(reference.path);
  for (const proof of manifest.proofs) {
    if (
      referenceEventKey(
        1n,
        BigInt(proof.sourceBlock),
        BigInt(proof.nativeTransactionIndex),
        BigInt(proof.receiptLocalLogIndex),
      ) !== proof.eventKey
    )
      throw new EvidenceError("Proof coordinate/event-key mismatch");
    if (
      proof.decodedEvent.saleId !== identity.saleId ||
      proof.decodedEvent.termsHash !== identity.termsHash ||
      proof.decodedEvent.claimId !== manifest.terms.claimId ||
      proof.decodedEvent.round !== manifest.terms.round
    )
      throw new EvidenceError("Manifest proof identity does not match campaign");
  }
  if (
    new Set(manifest.transactions.map((transaction) => transaction.transactionHash)).size !==
    manifest.transactions.length
  )
    throw new EvidenceError("Duplicate transaction evidence");
  const requiredActions = ["create", "reserve", "fund"];
  if (manifest.actualOutcome.sourceRoundState === 2) requiredActions.push("assign");
  if (manifest.actualOutcome.sourceRoundState === 3) requiredActions.push("cancel");
  if (manifest.actualOutcome.redeemed) requiredActions.push("redeem");
  if (manifest.actualOutcome.destinationState === 2) requiredActions.push("settle");
  if (manifest.actualOutcome.destinationState === 3) requiredActions.push("refund");
  for (const action of requiredActions) {
    if (
      manifest.transactions.filter(
        (transaction) =>
          transaction.action === `${manifest.campaignId}-${action}` &&
          transaction.receiptStatus === 1,
      ).length !== 1
    )
      throw new EvidenceError("Required successful campaign transaction omitted or duplicated");
  }
  const withdrawals = manifest.transactions.filter((transaction) =>
    transaction.action.includes("withdraw"),
  );
  if (JSON.stringify(withdrawals) !== JSON.stringify(manifest.withdrawals))
    throw new EvidenceError("Withdrawal evidence is omitted or invented");
  for (const token of manifest.tokens) {
    const expectedAddress = token.chainId === "11155111" ? pins.sourceToken : pins.token;
    if (token.address !== expectedAddress)
      throw new EvidenceError("Token metadata uses an unapproved address");
  }
  if (new Set(manifest.tokens.map((token) => token.chainId)).size !== 2)
    throw new EvidenceError("Both token domains must be present");
  const expected =
    manifest.campaignId === "a" ? "assigned-and-redeemed" : "cancelled-refunded-and-redeemed";
  if (manifest.expectedOutcome !== expected)
    throw new EvidenceError("Approved campaign outcome changed");
  return manifest;
}
