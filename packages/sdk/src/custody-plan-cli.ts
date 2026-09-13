import { ContractFactory, formatEther } from "ethers";
import { contractArtifact } from "./artifact.ts";
import { cc3Rpc, localConfiguration, localRole, provider, requireTestnet } from "./environment.ts";

const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC");
const chains = [
  {
    chainId: 11155111n,
    url: configuration.SOURCE_CHAIN_RPC_URL,
    name: "Morrow Source Test Token",
    symbol: "mSRC",
  },
  {
    chainId: 102031n,
    url: configuration.CREDITCOIN_RPC_URL ?? cc3Rpc,
    name: "Morrow Settlement Test Token",
    symbol: "mSET",
  },
];
for (const chain of chains) {
  const rpc = provider(chain.url);
  try {
    await requireTestnet(rpc, chain.chainId);
    const payer = localRole(configuration, "PAYER").connect(rpc);
    const artifact = contractArtifact("MorrowTestToken");
    const request = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(
      chain.name,
      chain.symbol,
      6,
      1_000_000_000_000n,
    );
    const [estimate, fee, balance] = await Promise.all([
      payer.estimateGas(request),
      rpc.getFeeData(),
      rpc.getBalance(payer.address),
    ]);
    const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
    if (gasPrice === null) throw new Error("Gas price unavailable");
    process.stdout.write(
      JSON.stringify({
        observedAt: new Date().toISOString(),
        evidenceKind: "live-read-verified",
        chainId: chain.chainId.toString(),
        payer: payer.address,
        payerGasBalance: formatEther(balance),
        deployment: chain.name,
        decimals: 6,
        initialSupplyRaw: "1000000000000",
        estimatedGas: estimate.toString(),
        gasPriceWei: gasPrice.toString(),
        bufferedCostCeiling: formatEther(((estimate * 125n) / 100n) * gasPrice),
        custodyEstimateBlocker:
          "Vault and market estimates require the respective token deployments first; no addresses are fabricated",
      }) + "\n",
    );
  } finally {
    rpc.destroy();
  }
}
