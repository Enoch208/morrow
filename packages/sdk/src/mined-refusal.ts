import { isError } from "ethers";
import type { Interface } from "ethers";
import { ConfigurationError } from "./errors.ts";

export interface RefusalReceipt {
  readonly status: number | null;
  readonly hash: string;
  readonly from: string;
  readonly to: string | null;
  readonly blockNumber: number;
  readonly blockHash: string;
  readonly gasUsed: bigint;
  readonly logs: readonly unknown[];
}

export function decodeExpectedRefusal(error: unknown, abi: Interface, expected: string) {
  if (!isError(error, "CALL_EXCEPTION"))
    throw new ConfigurationError("Expected EVM refusal but the RPC call failed differently");
  let name: string | null = null;
  let encodedReason: string | null = null;
  if (typeof error.data === "string") {
    try {
      const parsed = abi.parseError(error.data);
      name = parsed?.name ?? null;
      encodedReason =
        parsed?.name === "Error" && typeof parsed.args[0] === "string" ? parsed.args[0] : null;
    } catch {
      name = null;
    }
  }
  const actual = encodedReason ?? (error.reason === "Error" ? name : error.reason) ?? name;
  if (actual !== expected)
    throw new ConfigurationError(`Unexpected refusal ${actual ?? "without decodable reason"}`);
  return { name: actual, reason: error.reason, data: error.data };
}

export function refusalGasLimit(
  blockGasLimit: bigint,
  successfulProofGas: readonly bigint[],
): bigint {
  if (successfulProofGas.length === 0)
    throw new ConfigurationError("Missing successful proof gas baseline");
  const baseline = successfulProofGas.reduce((highest, value) =>
    value > highest ? value : highest,
  );
  const blockBound = blockGasLimit / 2n;
  const proposed = baseline * 2n;
  if (proposed > blockBound && blockBound <= baseline)
    throw new ConfigurationError("Refusal proof gas cannot fit safely within the block");
  return proposed < blockBound ? proposed : blockBound;
}

export function assertRefusalReceipt(
  receipt: RefusalReceipt,
  expectedHash: string,
  expectedFrom: string,
  expectedTo: string,
  expectedBlock: number,
  expectedBlockHash: string,
  gasLimit: bigint,
): void {
  if (receipt.status !== 0) throw new ConfigurationError("Refusal transaction did not revert");
  if (
    receipt.hash !== expectedHash ||
    receipt.from.toLowerCase() !== expectedFrom.toLowerCase() ||
    receipt.to?.toLowerCase() !== expectedTo.toLowerCase() ||
    receipt.blockNumber !== expectedBlock ||
    receipt.blockHash !== expectedBlockHash ||
    receipt.gasUsed >= gasLimit
  )
    throw new ConfigurationError("Refusal receipt differs from the signed intent or gas bound");
  if (receipt.logs.length !== 0)
    throw new ConfigurationError("Reverted transaction unexpectedly retained logs");
}
