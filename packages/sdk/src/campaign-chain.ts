import { keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { contractArtifact } from "./artifact.ts";
import {
  cc3Rpc,
  ConfigurationError,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";

export function campaignContext() {
  const configuration = localConfiguration();
  if (!configuration.SOURCE_CHAIN_RPC_URL) throw new ConfigurationError("Missing source RPC");
  const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
  const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
  const wallet = (role: keyof typeof campaignActors, rpc: JsonRpcProvider) => {
    const signer = localRole(configuration, role).connect(rpc);
    if (signer.address !== campaignActors[role])
      throw new ConfigurationError("Local role differs from campaign approval");
    return signer;
  };
  return {
    source,
    destination,
    wallet,
    close: () => {
      source.destroy();
      destination.destroy();
    },
  };
}

export async function verifyCampaignContract(
  rpc: JsonRpcProvider,
  key: keyof typeof campaignContracts,
  blockTag: number | "latest" = "latest",
) {
  const contract = campaignContracts[key];
  await requireTestnet(rpc, contract.chainId);
  if (keccak256(await rpc.getCode(contract.address, blockTag)) !== contract.codeHash)
    throw new ConfigurationError(`Pinned ${key} runtime mismatch`);
  return contractArtifact(contract.name).abi;
}

export async function campaignRead(
  rpc: JsonRpcProvider,
  key: keyof typeof campaignContracts,
  method: string,
  args: readonly unknown[] = [],
  blockTag: number | "latest" = "latest",
) {
  const contract = campaignContracts[key];
  const abi = contractArtifact(contract.name).abi;
  const calldata = abi.encodeFunctionData(method, args);
  const raw = await rpc.call({ to: contract.address, data: calldata, blockTag });
  return { calldata, raw, decoded: abi.decodeFunctionResult(method, raw) };
}

export function decodedInteger(value: unknown): bigint {
  if (typeof value !== "bigint") throw new ConfigurationError("Expected decoded integer");
  return value;
}
