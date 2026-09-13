import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import type { JsonRpcProvider, Result } from "ethers";
import { referenceEventKey, referenceIdentity } from "./index.ts";
import { EvidenceError, hex, integer, pins, read, tuple } from "./checker-rpc.ts";

export async function checkReservationProof(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  proof: Result,
  logIndex: bigint,
  terms: Readonly<Record<string, string>>,
  verificationBlock: number | "finalized" = "finalized",
) {
  const chainKey = integer(proof[0]);
  const height = integer(proof[1]);
  if (
    chainKey !== 1n ||
    height > BigInt(Number.MAX_SAFE_INTEGER) ||
    logIndex < 0n ||
    logIndex > BigInt(Number.MAX_SAFE_INTEGER)
  )
    throw new EvidenceError("Invalid source coordinates");
  const verified = await read(
    destination,
    "native",
    "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
    [chainKey, height, hex(proof[2]), tuple(proof[3]), tuple(proof[4])],
    verificationBlock,
  );
  if (verified.decoded[0] !== true) throw new EvidenceError("Native proof rejected");
  const indexRead = await read(
    destination,
    "native",
    "calculateTxIndex",
    [tuple(proof[3])],
    verificationBlock,
  );
  const txIndex = integer(indexRead.decoded[0]);
  if (txIndex > BigInt(Number.MAX_SAFE_INTEGER))
    throw new EvidenceError("Invalid native transaction index");
  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.decode(["uint8", "bytes[]"], hex(proof[2]));
  const chunks = tuple(encoded[1]);
  const receipt = coder.decode(
    ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"],
    hex(chunks[2]),
  );
  if (integer(receipt[0]) !== 1n) throw new EvidenceError("Source receipt was unsuccessful");
  const logs = tuple(receipt[2]);
  if (logIndex >= BigInt(logs.length)) throw new EvidenceError("Receipt-local log out of range");
  const event = tuple(logs[Number(logIndex)]);
  const topics = tuple(event[1]);
  const identity = referenceIdentity(terms);
  if (
    hex(event[0]).toLowerCase() !== pins.vault.toLowerCase() ||
    topics.length !== 4 ||
    topics[0] !== keccak256(toUtf8Bytes("SaleReserved(bytes32,uint256,uint256,bytes32,bytes)"))
  )
    throw new EvidenceError("Wrong source emitter or event signature");
  if (
    topics[1] !== identity.saleId ||
    BigInt(hex(topics[2])).toString() !== terms.claimId ||
    BigInt(hex(topics[3])).toString() !== terms.round
  )
    throw new EvidenceError("Reservation sale/claim/round binding mismatch");
  if (
    hex(event[2]) !==
    coder.encode(["bytes32", "bytes"], [identity.termsHash, identity.encodedTerms])
  )
    throw new EvidenceError("Reservation canonical terms mismatch");
  const block = await source.getBlock(Number(height));
  const hash = block?.transactions[Number(txIndex)];
  if (!block || !hash) throw new EvidenceError("Source block/transaction unavailable");
  const actual = await source.getTransactionReceipt(hash);
  const log = actual?.logs[Number(logIndex)];
  if (
    actual?.status !== 1 ||
    actual.blockHash !== block.hash ||
    actual.index !== Number(txIndex) ||
    log?.address.toLowerCase() !== hex(event[0]).toLowerCase() ||
    log.data !== hex(event[2]) ||
    JSON.stringify(log.topics) !== JSON.stringify(topics.toArray())
  )
    throw new EvidenceError("Source RPC receipt differs from authenticated receipt");
  const rawReceipt: unknown = actual.toJSON();
  return {
    sourceTransactionHash: hash,
    sourceBlock: block.number,
    sourceBlockHash: block.hash,
    sourceTimestamp: block.timestamp,
    receiptLocalLogIndex: logIndex,
    nativeTransactionIndex: txIndex,
    eventKey: referenceEventKey(chainKey, height, txIndex, logIndex),
    nativeVerification: verified.raw,
    nativeIndexRaw: indexRead.raw,
    sourceReceipt: rawReceipt,
  };
}
