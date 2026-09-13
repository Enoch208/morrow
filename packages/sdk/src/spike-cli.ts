import { ContractFactory, getAddress, keccak256 } from "ethers";
import type { TransactionRequest } from "ethers";
import { contractArtifact } from "./artifact.ts";
import {
  cc3Rpc,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";
import { recordSpike, spikeAddress } from "./spike-log.ts";
import { submitSpike } from "./spike-submit.ts";

const action = process.argv[2];
const allowed = [
  "deploy-approved",
  "deploy-unapproved",
  "deploy-receiver",
  "emit-approved",
  "emit-unapproved",
];
if (!action || !allowed.includes(action)) throw new Error(`Choose ${allowed.join(", ")}`);
const broadcast = process.argv.includes("--broadcast");
const configuration = localConfiguration();
const destinationAction = action === "deploy-receiver";
const rpcUrl = destinationAction
  ? (configuration.CREDITCOIN_RPC_URL ?? cc3Rpc)
  : configuration.SOURCE_CHAIN_RPC_URL;
if (!rpcUrl) throw new Error("SOURCE_CHAIN_RPC_URL missing in local .env");
const rpc = provider(rpcUrl);

try {
  const chainId = destinationAction ? 102031n : 11155111n;
  await requireTestnet(rpc, chainId);
  const wallet = localRole(configuration, "PAYER").connect(rpc);
  let transaction: TransactionRequest;
  let artifactHash: string;
  if (action.startsWith("deploy-")) {
    const artifact = contractArtifact(
      destinationAction ? "NativeSpikeReceiver" : "NativeSpikeEmitter",
    );
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    transaction = destinationAction
      ? await factory.getDeployTransaction(
          getAddress(await spikeAddress("deploy-approved")),
          wallet.address,
        )
      : await factory.getDeployTransaction();
    artifactHash = artifact.bytecodeHash;
  } else {
    const target = await spikeAddress(
      action === "emit-approved" ? "deploy-approved" : "deploy-unapproved",
    );
    const artifact = contractArtifact("NativeSpikeEmitter");
    transaction = {
      to: getAddress(target),
      data: artifact.abi.encodeFunctionData("emitProbe", [23n]),
    };
    artifactHash = artifact.bytecodeHash;
  }
  const estimate = await wallet.estimateGas(transaction);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null) throw new Error("Gas price unavailable");
  const gasLimit = (estimate * 125n) / 100n;
  const balance = await rpc.getBalance(wallet.address);
  const costCeiling = gasLimit * gasPrice;
  await recordSpike({
    action,
    state: "planned",
    evidenceKind: "live-read-verified",
    chainId,
    payer: wallet.address,
    artifactHash,
    estimate,
    gasLimit,
    gasPrice,
    costCeiling,
    gasBalanceRaw: balance,
    calldataHash: keccak256(transaction.data ?? "0x"),
  });
  if (balance < costCeiling) throw new Error("Insufficient testnet gas balance");
  if (broadcast) {
    await submitSpike(wallet, action, chainId, transaction, gasLimit, gasPrice, artifactHash);
  }
} catch (error: unknown) {
  await recordSpike({
    action,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  rpc.destroy();
}
