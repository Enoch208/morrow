import { AbiCoder, Interface, keccak256 } from "ethers";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import nativeAbi from "../../../schemas/abi/BlockProver.json" with { type: "json" };
import { pins } from "./deployment-pins.ts";
import { healthCheck } from "./health-check.ts";
import type { HealthSession } from "./health-check.ts";
import { refreshHealthContinuity } from "./health-continuity.ts";
import {
  HealthMismatch,
  HealthRevert,
  HealthUnavailable,
  publicRpc,
  readHealthBlock,
  rpcHex,
} from "./health-rpc.ts";

export interface HealthProofCase {
  readonly id: string;
  readonly name: string;
  readonly nativeCalldata: string;
  readonly marketCalldata: string;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly expectedError: string;
  readonly currentExpectedError?: string;
  readonly sourceTransactionHash: string;
  readonly from?: string;
  readonly correctMarketCalldata?: string;
}

const market = new Interface(marketAbi);
const native = new Interface(nativeAbi);
const proofTypes = [
  "uint64",
  "uint64",
  "bytes",
  "tuple(bytes32,tuple(bytes32,bool)[])",
  "tuple(bytes32,bytes32[])",
];

export function requireSameProof(nativeCalldata: string, marketCalldata: string): string {
  const nativeArgs = native
    .decodeFunctionData(nativeCalldata.slice(0, 10), nativeCalldata)
    .toArray();
  const envelope: unknown = market.decodeFunctionData(
    marketCalldata.slice(0, 10),
    marketCalldata,
  )[0];
  if (!Array.isArray(envelope)) throw new HealthMismatch("Malformed market proof envelope");
  const encode = (values: readonly unknown[]) =>
    keccak256(AbiCoder.defaultAbiCoder().encode(proofTypes, values.slice(0, 5)));
  const hash = encode(nativeArgs);
  if (encode(envelope) !== hash)
    throw new HealthMismatch("Native and market calls do not contain identical proof bytes");
  return hash;
}

async function expectRejection(
  session: HealthSession,
  data: string,
  expected: string,
  from?: string,
) {
  try {
    await publicRpc(
      session.endpoint,
      "eth_call",
      [{ to: pins.market, data, ...(from ? { from } : {}) }, session.block.number],
      session.request,
    );
  } catch (error: unknown) {
    if (!(error instanceof HealthRevert)) throw error;
    const parsed = market.parseError(error.data);
    if (parsed?.name === expected) return expected;
    throw new HealthUnavailable(
      `Cannot reproduce ${expected}; current execution returned ${parsed?.name ?? "an unknown revert"}`,
    );
  }
  throw new HealthMismatch(`Market accepted calldata expected to revert ${expected}`);
}

export async function proofHealth(
  session: HealthSession | null,
  proof: HealthProofCase,
  historical: boolean,
) {
  return healthCheck(
    `${proof.id}-${historical ? "historical" : "current"}`,
    `${proof.name} · ${historical ? "recorded block re-query" : "current block"}`,
    async () => {
      if (!session) throw new HealthUnavailable("No healthy CC3 RPC; proof has not been rechecked");
      const active = historical
        ? proof
        : {
            ...proof,
            ...(await refreshHealthContinuity(
              proof.sourceTransactionHash,
              proof.nativeCalldata,
              proof.marketCalldata,
              proof.correctMarketCalldata,
              session.request,
            )),
          };
      const fingerprint = requireSameProof(active.nativeCalldata, active.marketCalldata);
      const block = historical
        ? await readHealthBlock(
            session.endpoint,
            `0x${proof.blockNumber.toString(16)}`,
            session.request,
          )
        : session.block;
      if (historical && block.hash !== proof.blockHash)
        throw new HealthMismatch("Recorded proof block hash differs from public chain");
      const point = { ...session, block };
      let raw: string;
      try {
        raw = rpcHex(
          await publicRpc(
            point.endpoint,
            "eth_call",
            [{ to: pins.native, data: active.nativeCalldata }, block.number],
            point.request,
          ),
        );
      } catch (error: unknown) {
        if (error instanceof HealthRevert)
          throw new HealthUnavailable(
            "Native verifier rejected this envelope at this block; current proof continuity is not established",
          );
        throw error;
      }
      if (native.decodeFunctionResult(active.nativeCalldata.slice(0, 10), raw)[0] !== true)
        throw new HealthUnavailable(
          "Native verifier did not accept this proof envelope at this block",
        );
      const expectedError = historical
        ? proof.expectedError
        : (proof.currentExpectedError ?? proof.expectedError);
      const result = await expectRejection(
        point,
        active.marketCalldata,
        expectedError,
        proof.from,
      );
      if (active.correctMarketCalldata) {
        requireSameProof(active.nativeCalldata, active.correctMarketCalldata);
        await expectRejection(point, active.correctMarketCalldata, "SaleAlreadyExists", proof.from);
      }
      const canonical = await readHealthBlock(point.endpoint, block.number, point.request);
      if (canonical.hash !== block.hash)
        throw new HealthUnavailable("Proof observation reorganized; recheck required");
      return `Native true; market ${result}${active.correctMarketCalldata ? "; matching sale SaleAlreadyExists (already funded, not a new successful deposit)" : ""}; ${historical ? "archived" : "continuity-refreshed"} proof ${fingerprint}; block ${BigInt(block.number).toString()}`;
    },
    historical ? "historical-replay" : "live-read-verified",
  );
}
