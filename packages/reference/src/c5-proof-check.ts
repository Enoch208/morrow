import { AbiCoder } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError, hex, integer, read, tuple, interfaces } from "./checker-rpc.ts";
import { checkedArtifact, record, string, number } from "./evidence-files.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { referenceEventKey, referenceIdentity } from "./index.ts";
import { c5Actors, c5ReferenceTerms } from "./c5-policy.ts";
import { c5CanonicalBlock, c5CheckPins } from "./c5-chain.ts";

export const c5NativeMethod =
  "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))";
const coder = AbiCoder.defaultAbiCoder();

export async function checkC5Proof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  entry: Record<string, unknown>,
  claimId: string,
  round: string,
  event: "reserve" | "assign" | "cancel",
  overrideBlock?: number,
) {
  const path = string(entry.proofPath),
    hash = string(entry.proofHash);
  if (!path.startsWith("evidence/c5/"))
    throw new EvidenceError("C5 proof archive outside campaign");
  const proof = record(
    JSON.parse((await checkedArtifact({ path, sha256: hash })).toString("utf8")) as unknown,
  );
  const terms = c5ReferenceTerms(claimId, round),
    identity = referenceIdentity(terms);
  const original = entry.originalProofPath;
  if (original !== undefined) {
    const originalBytes = await checkedArtifact({
      path: string(original),
      sha256: string(entry.originalProofHash),
    });
    const initial = record(JSON.parse(originalBytes.toString("utf8")) as unknown);
    for (const key of ["chainKey", "headerNumber", "txBytes", "txHash", "merkleProof"])
      if (JSON.stringify(initial[key]) !== JSON.stringify(proof[key]))
        throw new EvidenceError(
          "C5 refreshed proof changed authenticated transaction or Merkle identity",
        );
  }
  if (number(proof.chainKey) !== 1) throw new EvidenceError("C5 proof source chain key mismatch");
  const height = number(proof.headerNumber),
    sourceHash = string(proof.txHash);
  if (entry.sourceTransactionHash !== sourceHash)
    throw new EvidenceError("C5 archived source transaction hash mismatch");
  const nativeRecord = record(entry.native);
  const destinationHeight = overrideBlock ?? number(nativeRecord.blockNumber);
  const destinationBlock = await destination.getBlock(destinationHeight);
  if (
    !destinationBlock?.hash ||
    (overrideBlock === undefined && destinationBlock.hash !== nativeRecord.blockHash)
  )
    throw new EvidenceError("C5 native verification history block mismatch");
  await c5CheckPins(destination, "destination", destinationHeight);
  const args = [1, height, string(proof.txBytes), proof.merkleProof, proof.continuityProof];
  const native = await read(destination, "native", c5NativeMethod, args, destinationHeight);
  if (native.decoded[0] !== true) throw new EvidenceError("C5 archived native proof rejected");
  const index = await read(
    destination,
    "native",
    "calculateTxIndex",
    [proof.merkleProof],
    destinationHeight,
  );
  const txIndex = integer(index.decoded[0]);
  if (txIndex < 0n || txIndex > BigInt(Number.MAX_SAFE_INTEGER))
    throw new EvidenceError("C5 native index out of range");
  const [block, actual, transaction] = await Promise.all([
    source.getBlock(height),
    source.getTransactionReceipt(sourceHash),
    source.getTransaction(sourceHash),
  ]);
  if (
    !block?.hash ||
    actual?.status !== 1 ||
    !transaction ||
    block.transactions[Number(txIndex)] !== sourceHash ||
    actual.blockHash !== block.hash ||
    actual.index !== Number(txIndex) ||
    actual.to !== applicationPins.vault.address
  )
    throw new EvidenceError("C5 proof coordinates lack canonical successful source transaction");
  await c5CheckPins(source, "source", height);
  const encoded = coder.decode(["uint8", "bytes[]"], string(proof.txBytes));
  const txType = integer(encoded[0]),
    chunks = tuple(encoded[1]);
  if (txType !== BigInt(actual.type) || txType > 4n || chunks.length !== (txType <= 2n ? 3 : 4))
    throw new EvidenceError("C5 authenticated transaction encoding mismatch");
  const common = coder.decode(
    ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"],
    hex(chunks[0]),
  );
  if (
    common[2] !== transaction.from ||
    common[3] !== false ||
    common[4] !== transaction.to ||
    common[5] !== 0n ||
    common[6] !== transaction.data
  )
    throw new EvidenceError("C5 authenticated transaction differs from RPC transaction");
  const receipt = coder.decode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    hex(chunks[chunks.length - 1]),
  );
  const logs = tuple(receipt[2]);
  if (
    receipt[0] !== 1n ||
    receipt[1] !== actual.gasUsed ||
    receipt[3] !== actual.logsBloom ||
    logs.length !== actual.logs.length
  )
    throw new EvidenceError("C5 authenticated receipt fields mismatch");
  for (let i = 0; i < logs.length; i++) {
    const log = tuple(logs[i]),
      observed = actual.logs[i];
    if (
      !observed ||
      observed.removed ||
      log[0] !== observed.address ||
      log[2] !== observed.data ||
      JSON.stringify(tuple(log[1]).toArray()) !== JSON.stringify(observed.topics)
    )
      throw new EvidenceError("C5 authenticated full receipt logs mismatch");
  }
  const abi = applicationInterfaces.vault;
  const eventName =
    event === "reserve" ? "SaleReserved" : event === "assign" ? "SaleAssigned" : "SaleCancelled";
  const method =
    event === "reserve" ? "reserveSale" : event === "assign" ? "assignSale" : "cancelExpiredSale";
  const callArgs =
    event === "reserve"
      ? [claimId, terms]
      : event === "assign"
        ? [claimId, round, identity.termsHash]
        : [claimId, round];
  if (
    transaction.data !== abi.encodeFunctionData(method, callArgs) ||
    transaction.value !== 0n ||
    transaction.chainId !== 11155111n ||
    (event !== "cancel" && transaction.from !== c5Actors.seller)
  )
    throw new EvidenceError("C5 authenticated source call differs from exact round");
  const fragment = abi.getEvent(eventName);
  if (!fragment) throw new EvidenceError("C5 source event ABI unavailable");
  const selected = actual.logs
    .map((log, i) => ({ log, i }))
    .filter(
      ({ log }) =>
        log.address === applicationPins.vault.address && log.topics[0] === fragment.topicHash,
    );
  const match = selected[0];
  const expected = abi.encodeEventLog(fragment, [
    identity.saleId,
    claimId,
    round,
    identity.termsHash,
    ...(event === "reserve" ? [identity.encodedTerms] : []),
  ]);
  if (
    selected.length !== 1 ||
    match?.log.data !== expected.data ||
    JSON.stringify(match.log.topics) !== JSON.stringify(expected.topics)
  )
    throw new EvidenceError("C5 native event semantic binding mismatch");
  const eventKey = referenceEventKey(1n, BigInt(height), txIndex, BigInt(match.i));
  if (
    entry.eventKey !== eventKey ||
    entry.receiptLocalLogIndex !== match.i ||
    entry.saleId !== identity.saleId ||
    entry.termsHash !== identity.termsHash
  )
    throw new EvidenceError(
      "C5 journal proof identity differs from independently authenticated data",
    );
  await Promise.all([
    c5CanonicalBlock(source, height, block.hash),
    c5CanonicalBlock(destination, destinationHeight, destinationBlock.hash),
  ]);
  const envelope = interfaces.native.decodeFunctionData(c5NativeMethod, native.data);
  return {
    proofPath: path,
    proofHash: hash,
    ...identity,
    eventKey,
    sourceTransactionHash: sourceHash,
    sourceBlock: height,
    receiptLocalLogIndex: match.i,
    nativeTransactionIndex: txIndex,
    nativeCalldata: native.data,
    nativeRaw: native.raw,
    nativeIndexRaw: index.raw,
    verificationBlock: destinationHeight,
    verificationBlockHash: destinationBlock.hash,
    envelope,
    terms,
    eventName,
  };
}
