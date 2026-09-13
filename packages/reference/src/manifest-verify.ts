import type { JsonRpcProvider, TransactionResponse } from "ethers";
import { checkedArtifact } from "./evidence-files.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { applicationPins, applicationRead } from "./manifest-chain.ts";
import { manifestArtifacts, validateManifest } from "./manifest-validation.ts";
import { checkManifestState } from "./manifest-state-check.ts";
import { checkHistoricalProof } from "./manifest-proof-history.ts";
import { requireProofCoverage } from "./proof-history.ts";
import { checkTransactionAction } from "./manifest-transactions.ts";
import { checkTransactionPayments } from "./transaction-payments.ts";
import { checkMarketHistory } from "./market-history-check.ts";
import { checkSourceHistory } from "./source-history-check.ts";
import { canonicalJson } from "./canonical-json.ts";
import { TransientEvidenceError } from "./verification-retry.ts";
import { checkManifestDeployment } from "./manifest-deployment-check.ts";

export async function verifyManifest(
  value: unknown,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  let phase = "schema";
  try {
    const manifest = validateManifest(value);
    const rpcFor = (chainId: string) => (chainId === "11155111" ? source : destination);
    if (
      (await source.getNetwork()).chainId !== 11155111n ||
      (await destination.getNetwork()).chainId !== 102031n
    )
      throw new EvidenceError("Wrong public testnet RPC");
    const artifacts = manifestArtifacts(manifest);
    await Promise.all(artifacts.map((artifact) => checkedArtifact(artifact)));
    for (const deployment of manifest.deployments) {
      phase = `deployment:${deployment.role}`;
      await checkManifestDeployment(deployment, rpcFor(deployment.chainId));
    }
    const transactions = new Map<string, TransactionResponse>();
    const paymentChecks = [];
    const marketTransitionChecks = [];
    const sourceTransitionChecks = [];
    for (const transaction of manifest.transactions) {
      phase = `transaction:${transaction.action}`;
      const rpc = rpcFor(transaction.chainId);
      const response = await rpc.getTransaction(transaction.transactionHash);
      if (!response) throw new EvidenceError("Claimed transaction unavailable");
      checkTransactionAction(transaction, response, manifest);
      transactions.set(transaction.transactionHash, response);
      const receipt = await rpc.getTransactionReceipt(transaction.transactionHash);
      if (
        receipt?.blockNumber !== transaction.blockNumber ||
        receipt.blockHash !== transaction.blockHash ||
        receipt.status !== transaction.receiptStatus
      )
        throw new EvidenceError("Manifest receipt coordinates/status differ from chain");
      const block = await rpc.getBlock(transaction.blockNumber);
      if (block?.hash !== transaction.blockHash)
        throw new EvidenceError("Transaction block is no longer canonical");
      const archived: unknown = JSON.parse(
        (await checkedArtifact(transaction.receipt)).toString("utf8"),
      );
      if (canonicalJson(archived) !== canonicalJson(receipt.toJSON() as unknown))
        throw new EvidenceError("Archived receipt fields/logs differ from live RPC");
      phase = `payments:${transaction.action}`;
      paymentChecks.push(
        await checkTransactionPayments(rpc, transaction, response, receipt, manifest),
      );
      if (response.to === applicationPins.market.address) {
        phase = `market-transition:${transaction.action}`;
        marketTransitionChecks.push(
          await checkMarketHistory(rpc, transaction, response, receipt, manifest),
        );
      }
      if (response.to === applicationPins.vault.address) {
        phase = `source-transition:${transaction.action}`;
        sourceTransitionChecks.push(
          await checkSourceHistory(rpc, transaction, response, receipt, manifest),
        );
      }
    }
    await requireProofCoverage(manifest, transactions);
    const proofChecks = [];
    for (const proof of manifest.proofs) {
      phase = `proof:${proof.decodedEvent.name}`;
      proofChecks.push(
        await checkHistoricalProof(source, destination, proof, manifest, transactions),
      );
    }
    for (const snapshot of manifest.snapshots) {
      phase = `snapshot:${snapshot.chainId}`;
      const rpc = rpcFor(snapshot.chainId);
      const block = await rpc.getBlock(snapshot.blockNumber);
      if (block?.hash !== snapshot.blockHash || block.timestamp !== snapshot.timestamp)
        throw new EvidenceError("State snapshot block/hash/timestamp mismatch");
      for (const read of snapshot.reads) {
        if (applicationPins[read.role].chainId !== snapshot.chainId)
          throw new EvidenceError("State read targets wrong deployment chain");
        const actual = await applicationRead(
          rpc,
          read.role,
          read.method,
          read.args,
          snapshot.blockNumber,
        );
        if (actual.raw !== read.raw)
          throw new EvidenceError("Archived state differs from chain at declared block");
      }
    }
    checkManifestState(manifest);
    return {
      campaignId: manifest.campaignId,
      saleId: manifest.identity.saleId,
      artifactsChecked: artifacts.length,
      transactionsChecked: manifest.transactions.length,
      paymentChecks,
      marketTransitionChecks,
      sourceTransitionChecks,
      nativeProofsChecked: manifest.proofs.length,
      proofChecks,
      verificationMode: "historical-replay-with-explicit-current-proof-compatibility",
      snapshotsChecked: manifest.snapshots.length,
      state: manifest.actualOutcome,
      fullReleaseVerified: false,
      unresolvedFacts: manifest.unresolvedFacts,
      limitations:
        "Verifies receipts, historical native proofs, deployments, token payments and successful campaign source/destination state transitions; other rounds, reverted transactions, arbitrary storage slots and complete release requirements remain separate",
    };
  } catch (error: unknown) {
    if (error instanceof EvidenceError) throw new EvidenceError(`${phase}: ${error.message}`);
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_/-]+$/.test(error.code)
        ? error.code
        : "DEPENDENCY_OR_DATA_ERROR";
    const transient = [
      "TIMEOUT",
      "NETWORK_ERROR",
      "SERVER_ERROR",
      "ECONNRESET",
      "ETIMEDOUT",
      "EPROTO",
      "ERR_SSL_SSL/TLS_ALERT_BAD_RECORD_MAC",
    ].includes(code);
    if (transient) throw new TransientEvidenceError(`${phase}: ${code}`);
    throw new EvidenceError(`${phase}: ${code}`);
  }
}
