import { Interface, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import tokenAbi from "../../../schemas/abi/MorrowTestToken.json" with { type: "json" };
import { campaignContracts } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

const tokenInterface = new Interface(tokenAbi);
export const contractInterfaces = {
  vault: new Interface(vaultAbi),
  market: new Interface(marketAbi),
  sourceToken: tokenInterface,
  settlementToken: tokenInterface,
};

export async function verifyCampaignContract(
  rpc: JsonRpcProvider,
  key: keyof typeof campaignContracts,
  blockTag: number | "latest" = "latest",
) {
  const contract = campaignContracts[key];
  const chainId: unknown = await rpc.send("eth_chainId", []);
  if (
    typeof chainId !== "string" ||
    !/^0x[0-9a-f]+$/i.test(chainId) ||
    BigInt(chainId) !== contract.chainId
  )
    throw new ConfigurationError(`Pinned ${key} chain mismatch`);
  if (keccak256(await rpc.getCode(contract.address, blockTag)) !== contract.codeHash)
    throw new ConfigurationError(`Pinned ${key} runtime mismatch`);
  return contractInterfaces[key];
}

export async function campaignRead(
  rpc: JsonRpcProvider,
  key: keyof typeof campaignContracts,
  method: string,
  args: readonly unknown[] = [],
  blockTag: number | "latest" = "latest",
) {
  const contract = campaignContracts[key];
  const abi = contractInterfaces[key];
  const calldata = abi.encodeFunctionData(method, args);
  const raw = await rpc.call({ to: contract.address, data: calldata, blockTag });
  return { calldata, raw, decoded: abi.decodeFunctionResult(method, raw) };
}
