import type { JsonRpcProvider } from "ethers";
import { campaignActors } from "./campaign-config.ts";
import {
  cc3Rpc,
  ConfigurationError,
  localConfiguration,
  localRole,
  provider,
} from "./environment.ts";

export { campaignRead, verifyCampaignContract } from "./contract-reads.ts";
export { decodedInteger } from "./decoded-state.ts";

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
