import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { AbiCoder, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import type { CampaignName } from "./campaign-config.ts";
import { campaignContracts, campaignTerms } from "./campaign-config.ts";
import { campaignRecord, recordCampaign } from "./campaign-log.ts";
import { contractArtifact } from "./artifact.ts";
import { decodedHash } from "./decoded-state.ts";
import { decodedInteger } from "./campaign-chain.ts";
import { obtainProof, verifyNativeProof } from "./proof.ts";
import { saleIdentity, encodeTerms } from "./canonical.ts";
import { ConfigurationError, proverEndpoints, repositoryRoot } from "./environment.ts";

export async function campaignClaimId(name: CampaignName): Promise<bigint> {
  const creation = await campaignRecord(`${name}-create`, "claim-verified");
  if (typeof creation.claimId !== "string" || !/^\d+$/.test(creation.claimId))
    throw new ConfigurationError("Missing actual claim ID");
  return BigInt(creation.claimId);
}

export async function buildCampaignProof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  name: CampaignName,
  event: "reserve" | "assign" | "cancel",
) {
  const entry = await campaignRecord(`${name}-${event}`, "mined");
  if (typeof entry.transactionHash !== "string")
    throw new ConfigurationError("Missing mined source hash");
  const receipt = await source.getTransactionReceipt(entry.transactionHash);
  if (receipt?.status !== 1)
    throw new ConfigurationError("Source transaction not successfully mined");
  const terms = campaignTerms(name, await campaignClaimId(name));
  const identity = saleIdentity(terms);
  const abi = contractArtifact("FundedPaymentVault").abi;
  const eventName =
    event === "reserve" ? "SaleReserved" : event === "assign" ? "SaleAssigned" : "SaleCancelled";
  const matches = receipt.logs
    .map((log, index) => ({ log, index }))
    .filter(
      ({ log }) =>
        log.address.toLowerCase() === campaignContracts.vault.address.toLowerCase() &&
        log.topics[0] === abi.getEvent(eventName)?.topicHash,
    );
  const selected = matches[0];
  if (!selected || matches.length !== 1)
    throw new ConfigurationError("Source event missing or ambiguous");
  const decoded = abi.parseLog(selected.log);
  if (
    !decoded ||
    decodedHash(decoded.args[0]) !== identity.saleId ||
    decodedInteger(decoded.args[1]) !== terms.claimId ||
    decodedInteger(decoded.args[2]) !== 1n ||
    decodedHash(decoded.args[3]) !== identity.termsHash
  )
    throw new ConfigurationError("Source event identity mismatch");
  if (event === "reserve" && decoded.args[4] !== encodeTerms(terms))
    throw new ConfigurationError("Source event canonical bytes mismatch");
  const started = Date.now();
  const { proof, raw } = await obtainProof(entry.transactionHash, proverEndpoints[0]);
  const proofReadyAt = new Date().toISOString();
  const proofConstructionMs = Date.now() - started;
  const proofText = JSON.stringify(raw);
  const proofHash = createHash("sha256").update(proofText).digest("hex");
  const proofPath = `evidence/campaign/${name}-${event}-${Date.now().toString()}-${proofHash}.json`;
  await writeFile(`${repositoryRoot}${proofPath}`, proofText, { flag: "wx" });
  if (proof.blockHeight !== BigInt(receipt.blockNumber))
    throw new ConfigurationError("Proof block mismatch");
  const native = await verifyNativeProof(destination, proof);
  if (native.provenTxIndex !== BigInt(receipt.index))
    throw new ConfigurationError("Native transaction index mismatch");
  const eventKey = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint64", "uint64", "uint64", "uint256"],
      [proof.chainKey, proof.blockHeight, native.provenTxIndex, selected.index],
    ),
  );
  await recordCampaign({
    action: `${name}-${event}-proof`,
    state: "native-verified",
    evidenceKind: "live-read-verified",
    sourceTransactionHash: receipt.hash,
    sourceBlock: receipt.blockNumber,
    proofPath,
    proofHash,
    proofReadyAt,
    proofConstructionMs,
    native,
    receiptLocalLogIndex: selected.index,
    eventKey,
    ...identity,
  });
  return {
    proof,
    proofPath,
    proofHash,
    terms,
    identity,
    eventKey,
    logIndex: selected.index,
    sourceReceipt: receipt,
  };
}
