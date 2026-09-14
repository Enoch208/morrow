import { AbiCoder, Interface, keccak256 } from "ethers";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import nativeAbi from "../../../schemas/abi/BlockProver.json" with { type: "json" };
import { HealthMismatch, HealthUnavailable } from "./health-rpc.ts";
import type { RpcFetch } from "./health-rpc.ts";

const market = new Interface(marketAbi);
const native = new Interface(nativeAbi);
const proofTypes = [
  "uint64",
  "uint64",
  "bytes",
  "tuple(bytes32,tuple(bytes32,bool)[])",
  "tuple(bytes32,bytes32[])",
];
const immutableProofTypes = proofTypes.slice(0, 4);
const proofService = "https://prover.cc3-testnet.creditcoin.network/api/v1/proof-by-tx/1/";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HealthUnavailable("Proof service returned malformed JSON");
  return value as Record<string, unknown>;
}

function proofValues(value: unknown): readonly unknown[] {
  const proof = object(value);
  const merkle = object(proof.merkleProof);
  const continuity = object(proof.continuityProof);
  if (!Array.isArray(merkle.siblings) || !Array.isArray(continuity.roots))
    throw new HealthUnavailable("Proof service returned malformed proof branches");
  return [
    proof.chainKey,
    proof.headerNumber,
    proof.txBytes,
    [
      merkle.root,
      merkle.siblings.map((value) => {
        const sibling = object(value);
        return [sibling.hash, sibling.isLeft];
      }),
    ],
    [continuity.lowerEndpointDigest, continuity.roots],
  ];
}

function immutableFingerprint(values: readonly unknown[]): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(immutableProofTypes, values.slice(0, 4)));
}

function replaceProof(calldata: string, envelope: readonly unknown[]): string {
  const selector = calldata.slice(0, 10);
  const args = market.decodeFunctionData(selector, calldata).toArray();
  const trailing = args.slice(1) as unknown[];
  return market.encodeFunctionData(selector, [envelope, ...trailing]);
}

export async function refreshHealthContinuity(
  sourceTransactionHash: string,
  nativeCalldata: string,
  marketCalldata: string,
  correctMarketCalldata: string | undefined,
  request: RpcFetch,
) {
  if (!/^0x[0-9a-f]{64}$/i.test(sourceTransactionHash))
    throw new HealthMismatch("Recorded source transaction hash is malformed");
  const archived = native
    .decodeFunctionData(nativeCalldata.slice(0, 10), nativeCalldata)
    .toArray();
  let response: Response;
  try {
    response = await request(proofService + sourceTransactionHash, {
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });
  } catch {
    throw new HealthUnavailable("Proof continuity refresh transport unavailable");
  }
  if (!response.ok)
    throw new HealthUnavailable(
      `Proof continuity refresh returned HTTP ${response.status.toString()}`,
    );
  const refreshed = object(await response.json());
  if (refreshed.txHash !== sourceTransactionHash)
    throw new HealthMismatch("Proof continuity refresh changed the source transaction hash");
  const envelope = proofValues(refreshed);
  const archivedFingerprint = immutableFingerprint(archived);
  if (immutableFingerprint(envelope) !== archivedFingerprint)
    throw new HealthMismatch("Proof continuity refresh changed authenticated source components");
  const refreshedNativeCalldata = native.encodeFunctionData(
    nativeCalldata.slice(0, 10),
    envelope,
  );
  return {
    nativeCalldata: refreshedNativeCalldata,
    marketCalldata: replaceProof(marketCalldata, envelope),
    ...(correctMarketCalldata
      ? { correctMarketCalldata: replaceProof(correctMarketCalldata, envelope) }
      : {}),
    authenticatedFingerprint: archivedFingerprint,
  };
}
