import { AbiCoder } from "ethers";
import type { JsonRpcProvider } from "ethers";
import type { CampaignManifest, ProofEvidence } from "./manifest-types.ts";
import { checkedArtifact, record, number, string } from "./evidence-files.ts";
import { EvidenceError, integer, read, tuple, pins } from "./checker-rpc.ts";
import { referenceEventKey } from "./index.ts";
import { applicationInterfaces } from "./manifest-chain.ts";

export async function checkManifestProof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  item: ProofEvidence,
  manifest: CampaignManifest,
  verificationBlock: number | "finalized" = "finalized",
): Promise<void> {
  const proof = record(
    JSON.parse((await checkedArtifact(item.artifact)).toString("utf8")) as unknown,
  );
  if (
    number(proof.chainKey) !== 1 ||
    number(proof.headerNumber) !== item.sourceBlock ||
    proof.txHash !== item.sourceTransactionHash
  )
    throw new EvidenceError("Manifest proof transport coordinates mismatch");
  const native = await read(
    destination,
    "native",
    "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
    [proof.chainKey, proof.headerNumber, proof.txBytes, proof.merkleProof, proof.continuityProof],
    verificationBlock,
  );
  if (native.decoded[0] !== true)
    throw new EvidenceError("Archived proof fails native verification at the declared block");
  const nativeIndex = await read(
    destination,
    "native",
    "calculateTxIndex",
    [proof.merkleProof],
    verificationBlock,
  );
  const index = integer(nativeIndex.decoded[0]);
  if (index.toString() !== item.nativeTransactionIndex || index > BigInt(Number.MAX_SAFE_INTEGER))
    throw new EvidenceError("Native transaction index differs from manifest");
  const sourceBlock = await source.getBlock(item.sourceBlock);
  if (sourceBlock?.transactions[Number(index)] !== item.sourceTransactionHash)
    throw new EvidenceError("Native coordinate does not resolve to claimed source transaction");
  const sourceReceipt = await source.getTransactionReceipt(item.sourceTransactionHash);
  if (sourceReceipt?.status !== 1 || sourceReceipt.blockHash !== sourceBlock.hash)
    throw new EvidenceError("Authenticated source transaction lacks canonical success receipt");
  const actualLog = sourceReceipt.logs[item.receiptLocalLogIndex];
  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.decode(["uint8", "bytes[]"], string(proof.txBytes));
  const chunks = tuple(encoded[1]);
  const receipt = coder.decode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    string(chunks[2]),
  );
  if (integer(receipt[0]) !== 1n) throw new EvidenceError("Native source receipt is unsuccessful");
  const log = tuple(tuple(receipt[2])[item.receiptLocalLogIndex]);
  const topics = tuple(log[1])
    .toArray()
    .map((value: unknown) => string(value));
  if (
    log[0] !== pins.vault ||
    actualLog?.address !== pins.vault ||
    actualLog.data !== log[2] ||
    JSON.stringify(actualLog.topics) !== JSON.stringify(topics)
  )
    throw new EvidenceError("Authenticated source log differs from RPC receipt");
  const event = applicationInterfaces.vault.parseLog(actualLog);
  if (
    event?.name !== item.decodedEvent.name ||
    event.args[0] !== manifest.identity.saleId ||
    integer(event.args[1]).toString() !== manifest.terms.claimId ||
    integer(event.args[2]).toString() !== manifest.terms.round ||
    event.args[3] !== manifest.identity.termsHash
  )
    throw new EvidenceError("Authenticated event differs from exact campaign identity");
  const expectedData =
    event.name === "SaleReserved"
      ? coder.encode(
          ["bytes32", "bytes"],
          [manifest.identity.termsHash, manifest.identity.encodedTerms],
        )
      : coder.encode(["bytes32"], [manifest.identity.termsHash]);
  if (actualLog.data !== expectedData)
    throw new EvidenceError("Source event canonical bytes differ");
  if (
    referenceEventKey(1n, BigInt(item.sourceBlock), index, BigInt(item.receiptLocalLogIndex)) !==
    item.eventKey
  )
    throw new EvidenceError("Authenticated event identity differs from manifest");
}
