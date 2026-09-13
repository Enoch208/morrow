import { AbiCoder, Interface, keccak256 } from "ethers";
import { abis } from "./abis";

export interface ProofFingerprint {
  readonly nativeHash: string;
  readonly marketHash: string;
  readonly identical: boolean;
  readonly chainKey: string;
  readonly sourceBlock: string;
  readonly encodedTransactionBytes: number;
}

const proofFieldTypes = [
  "uint64",
  "uint64",
  "bytes",
  "tuple(bytes32,tuple(bytes32,bool)[])",
  "tuple(bytes32,bytes32[])",
];

const prover = new Interface(abis.prover);
const market = new Interface(abis.market);

function proofFields(values: readonly unknown[]): string {
  return keccak256(AbiCoder.defaultAbiCoder().encode(proofFieldTypes, values.slice(0, 5)));
}

export function fingerprintProofs(
  nativeCalldata: string,
  marketCalldata: string,
): ProofFingerprint {
  const nativeArgs = prover
    .decodeFunctionData(nativeCalldata.slice(0, 10), nativeCalldata)
    .toArray();
  const marketArgs = market
    .decodeFunctionData(marketCalldata.slice(0, 10), marketCalldata)
    .toArray();
  const envelope: unknown = marketArgs[0];
  if (!Array.isArray(envelope)) {
    throw new Error("Unexpected proof envelope shape");
  }
  const nativeHash = proofFields(nativeArgs);
  const marketHash = proofFields(envelope);
  const encoded: unknown = nativeArgs[2];
  return {
    nativeHash,
    marketHash,
    identical: nativeHash === marketHash,
    chainKey: String(nativeArgs[0]),
    sourceBlock: String(nativeArgs[1]),
    encodedTransactionBytes: typeof encoded === "string" ? (encoded.length - 2) / 2 : 0,
  };
}
