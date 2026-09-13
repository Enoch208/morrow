import { Interface, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };
import { EvidenceError, interfaces, pins } from "./checker-rpc.ts";
import type { ChainSnapshot, DeploymentRole, StateRead } from "./manifest-types.ts";

export const applicationInterfaces = {
  vault: new Interface(vaultAbi),
  market: interfaces.market,
  sourceToken: interfaces.token,
  settlementToken: interfaces.token,
};
export const applicationPins = {
  vault: { address: pins.vault, chainId: "11155111", codeHash: pins.sourceCodeHash },
  market: { address: pins.market, chainId: "102031", codeHash: pins.marketCodeHash },
  sourceToken: { address: pins.sourceToken, chainId: "11155111", codeHash: pins.tokenCodeHash },
  settlementToken: { address: pins.token, chainId: "102031", codeHash: pins.tokenCodeHash },
} as const;

export async function applicationRead(
  rpc: JsonRpcProvider,
  role: DeploymentRole,
  method: string,
  args: readonly string[],
  block: number,
): Promise<StateRead> {
  const abi = applicationInterfaces[role];
  const fragment = abi.getFunction(method);
  if (!fragment || (fragment.stateMutability !== "view" && fragment.stateMutability !== "pure"))
    throw new EvidenceError("Evidence reader accepts only read-only ABI functions");
  const data = abi.encodeFunctionData(fragment, args);
  return {
    role,
    method,
    args,
    raw: await rpc.call({ to: applicationPins[role].address, data, blockTag: block }),
  };
}

export async function snapshots(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  terms: Readonly<Record<string, string>>,
  saleId: string,
): Promise<readonly ChainSnapshot[]> {
  const claimId = terms.claimId;
  const round = terms.round;
  const actors = [terms.seller, terms.buyer, terms.feeRecipient];
  if (!claimId || !round || actors.some((actor) => !actor))
    throw new EvidenceError("Incomplete snapshot terms");
  const output: ChainSnapshot[] = [];
  for (const [chainId, rpc] of [
    ["11155111", source],
    ["102031", destination],
  ] as const) {
    if ((await rpc.getNetwork()).chainId.toString() !== chainId)
      throw new EvidenceError("Wrong snapshot network");
    const block = await rpc.getBlock("latest");
    if (!block?.hash) throw new EvidenceError("Snapshot block unavailable");
    for (const role of Object.keys(applicationPins) as DeploymentRole[]) {
      const pin = applicationPins[role];
      if (
        pin.chainId === chainId &&
        keccak256(await rpc.getCode(pin.address, block.number)) !== pin.codeHash
      )
        throw new EvidenceError("Snapshot runtime mismatch");
    }
    const calls: { role: DeploymentRole; method: string; args: string[] }[] =
      chainId === "11155111"
        ? [
            { role: "vault", method: "getClaim", args: [claimId] },
            { role: "vault", method: "getRound", args: [claimId, round] },
            { role: "vault", method: "totalBacking", args: [] },
            { role: "sourceToken", method: "balanceOf", args: [pins.vault] },
            { role: "sourceToken", method: "decimals", args: [] },
          ]
        : [
            { role: "market", method: "getSale", args: [saleId] },
            ...["totalBound", "totalCredits", "totalLiabilities"].map((method) => ({
              role: "market" as const,
              method,
              args: [],
            })),
            { role: "settlementToken", method: "balanceOf", args: [pins.market] },
            { role: "settlementToken", method: "decimals", args: [] },
          ];
    for (const actor of actors) {
      if (!actor) throw new EvidenceError("Missing actor");
      calls.push({
        role: chainId === "11155111" ? "sourceToken" : "settlementToken",
        method: "balanceOf",
        args: [actor],
      });
      if (chainId === "102031") calls.push({ role: "market", method: "credits", args: [actor] });
    }
    const reads = await Promise.all(
      calls.map((call) => applicationRead(rpc, call.role, call.method, call.args, block.number)),
    );
    output.push({
      chainId,
      blockNumber: block.number,
      blockHash: block.hash,
      timestamp: block.timestamp,
      reads,
    });
  }
  return output;
}
