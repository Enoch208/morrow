import { proofProvider } from "@gluwa/usc-sdk";
import type { Hex, ProofEnvelope } from "@morrow/protocol";
import type { JsonRpcProvider } from "ethers";
import { readNative } from "./native.ts";

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected proof object");
  return value as Record<string, unknown>;
}

function hex(value: unknown, byteLength?: number): Hex {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})+$/.test(value) ||
    (byteLength !== undefined && value.length !== 2 + byteLength * 2)
  )
    throw new Error("Invalid proof hex encoding");
  return value as Hex;
}

function integer(value: unknown): bigint {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Unsafe proof integer");
  return BigInt(value);
}

export function parseProof(value: unknown, expectedTransactionHash: string): ProofEnvelope {
  const data = object(value);
  if (hex(data.txHash, 32).toLowerCase() !== hex(expectedTransactionHash, 32).toLowerCase())
    throw new Error("Requested transaction mismatch");
  const merkle = object(data.merkleProof);
  const continuity = object(data.continuityProof);
  if (!Array.isArray(merkle.siblings) || !Array.isArray(continuity.roots))
    throw new Error("Invalid proof arrays");
  return {
    chainKey: integer(data.chainKey),
    blockHeight: integer(data.headerNumber),
    encodedTransaction: hex(data.txBytes),
    merkleProof: {
      root: hex(merkle.root, 32),
      siblings: merkle.siblings.map((entry: unknown) => {
        const sibling = object(entry);
        if (typeof sibling.isLeft !== "boolean") throw new Error("Invalid Merkle direction");
        return { hash: hex(sibling.hash, 32), isLeft: sibling.isLeft };
      }),
    },
    continuityProof: {
      lowerEndpointDigest: hex(continuity.lowerEndpointDigest, 32),
      roots: continuity.roots.map((entry: unknown) => hex(entry, 32)),
    },
  };
}

export async function obtainProof(
  transactionHash: string,
  endpoint: string,
): Promise<{ proof: ProofEnvelope; raw: unknown }> {
  hex(transactionHash, 32);
  const result = await new proofProvider.service.ProofBuilder(1, endpoint, 12_000).getProof(
    transactionHash,
  );
  if (!result.success || !result.data)
    throw new Error(result.error ?? "Proof service returned no proof");
  const proof = parseProof(result.data, transactionHash);
  if (proof.chainKey !== 1n) throw new Error("Unexpected source chain key");
  return { proof, raw: result.data };
}

export async function verifyNativeProof(
  rpc: JsonRpcProvider,
  proof: ProofEnvelope,
  blockTag: number | "finalized" = "finalized",
) {
  const verification = await readNative(
    rpc,
    "blockProver",
    "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
    [
      proof.chainKey,
      proof.blockHeight,
      proof.encodedTransaction,
      proof.merkleProof,
      proof.continuityProof,
    ],
    blockTag,
  );
  if (verification.decoded[0] !== true) throw new Error("Native proof verification failed");
  const index = await readNative(
    rpc,
    "blockProver",
    "calculateTxIndex",
    [proof.merkleProof],
    blockTag,
  );
  const provenTxIndex: unknown = index.decoded[0];
  if (typeof provenTxIndex !== "bigint") throw new Error("Invalid native transaction index");
  return { verification, index, provenTxIndex };
}
