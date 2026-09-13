import { FunctionFragment, Interface } from "ethers";
import type { ChainKey } from "@/lib/explorers";
import { abis } from "./abis";
import { scanBytecode, type ForbiddenOpcode } from "./bytecode";
import { deployments } from "./deployments";
import { providers } from "./providers";

export type SurfaceContract = "vault" | "market";

export interface ContractSurface {
  readonly contract: SurfaceContract;
  readonly name: string;
  readonly chain: ChainKey;
  readonly address: string;
  readonly block: number;
  readonly executableBytes: number;
  readonly abiFunctionCount: number;
  readonly writeFunctions: readonly string[];
  readonly undispatched: readonly string[];
  readonly unlisted: readonly string[];
  readonly forbiddenCounts: Readonly<Record<ForbiddenOpcode, number>>;
}

const surfaceTargets: Readonly<
  Record<SurfaceContract, { name: string; chain: ChainKey; address: string }>
> = {
  vault: { name: "FundedPaymentVault", chain: "sepolia", address: deployments.vault },
  market: { name: "MorrowMarket", chain: "cc3", address: deployments.market },
};

function abiFunctions(contract: SurfaceContract): readonly FunctionFragment[] {
  return new Interface(abis[contract]).fragments.filter((fragment) =>
    FunctionFragment.isFragment(fragment),
  );
}

export async function readContractSurface(contract: SurfaceContract): Promise<ContractSurface> {
  const target = surfaceTargets[contract];
  const provider = providers[target.chain];
  const block = await provider.getBlockNumber();
  const code = await provider.getCode(target.address, block);
  if (code === "0x") {
    throw new Error(`${target.name} has no code at block ${block.toString()}`);
  }
  const scan = scanBytecode(code);
  const functions = abiFunctions(contract);
  const abiSelectors = new Set(functions.map((fragment) => fragment.selector));
  return {
    contract,
    ...target,
    block,
    executableBytes: scan.executableBytes,
    abiFunctionCount: functions.length,
    writeFunctions: functions
      .filter((fragment) => !fragment.constant)
      .map((fragment) => fragment.name),
    undispatched: functions
      .filter((fragment) => !scan.dispatchedSelectors.has(fragment.selector))
      .map((fragment) => fragment.format("sighash")),
    unlisted: [...scan.dispatchedSelectors].filter((selector) => !abiSelectors.has(selector)),
    forbiddenCounts: scan.forbiddenCounts,
  };
}

export function isSurfaceSealed(surface: ContractSurface): boolean {
  return (
    surface.undispatched.length === 0 &&
    surface.unlisted.length === 0 &&
    Object.values(surface.forbiddenCounts).every((count) => count === 0)
  );
}
