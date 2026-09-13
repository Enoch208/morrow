import { Interface } from "ethers";
import chainInfoAbi from "@gluwa/usc-sdk/dist/chain-info/chain_info.json";
import { asBigInt, asBoolean, resultField } from "./decoded";
import { attestcoinChainKeys } from "./deployments";
import { providers } from "./providers";

const chainInfoAddress = "0x0000000000000000000000000000000000000FD3";
const chainInfo = new Interface(chainInfoAbi);

export interface AttestationFrontier {
  readonly attestedHeight: bigint;
  readonly checkpointHeight: bigint;
  readonly sourceHead: bigint;
  readonly lagBlocks: bigint;
  readonly readAtCc3Block: number;
}

async function readChainInfo(
  method: string,
  args: readonly unknown[],
  blockTag: number,
): Promise<unknown> {
  const data = chainInfo.encodeFunctionData(method, args);
  const raw = await providers.cc3.call({ to: chainInfoAddress, data, blockTag });
  const decoded: unknown = chainInfo.decodeFunctionResult(method, raw)[0];
  return decoded;
}

export async function readAttestationFrontier(): Promise<AttestationFrontier> {
  const [cc3Block, sourceHead] = await Promise.all([
    providers.cc3.getBlockNumber(),
    providers.sepolia.getBlockNumber(),
  ]);
  const key = attestcoinChainKeys.sepolia;
  const [attestation, checkpoint] = await Promise.all([
    readChainInfo("get_latest_attestation_height_and_hash", [key], cc3Block),
    readChainInfo("get_latest_checkpoint_height_and_hash", [key], cc3Block),
  ]);
  const attestedHeight = asBigInt(resultField(attestation, "height"));
  const checkpointHeight = asBigInt(resultField(checkpoint, "height"));
  if (attestedHeight === undefined || checkpointHeight === undefined) {
    throw new Error("Unexpected ChainInfo response");
  }
  const head = BigInt(sourceHead);
  return {
    attestedHeight,
    checkpointHeight,
    sourceHead: head,
    lagBlocks: head > attestedHeight ? head - attestedHeight : 0n,
    readAtCc3Block: cc3Block,
  };
}

export async function isSourceHeightAttested(height: number): Promise<boolean> {
  const cc3Block = await providers.cc3.getBlockNumber();
  const attested = asBoolean(
    await readChainInfo("is_height_attested", [attestcoinChainKeys.sepolia, height], cc3Block),
  );
  if (attested === undefined) {
    throw new Error("Unexpected ChainInfo response");
  }
  return attested;
}
