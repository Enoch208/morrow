import { ContractFactory, keccak256 } from "ethers";
import { open } from "node:fs/promises";
import { contractArtifact } from "./artifact.ts";
import { checkCustodyBudget } from "./custody-budget.ts";
import { custodyAction, custodyConfiguration } from "./custody-config.ts";
import { archiveCustodyArtifact, custodyRecords, recordCustody } from "./custody-log.ts";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";

const action = custodyAction(process.argv[2]);
const broadcast = process.argv.includes("--broadcast");
const configuration = localConfiguration();
const payer = localRole(configuration, "PAYER");
const deployment = await custodyConfiguration(action, payer.address);
const url =
  deployment.chainId === 11155111n
    ? configuration.SOURCE_CHAIN_RPC_URL
    : (configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
if (!url) throw new ConfigurationError("Missing source RPC");
const rpc = provider(url);
try {
  await requireTestnet(rpc, deployment.chainId);
  const wallet = payer.connect(rpc);
  const artifact = contractArtifact(deployment.name);
  const artifactSha256 = await archiveCustodyArtifact(deployment.name);
  const transaction = await new ContractFactory(
    artifact.abi,
    artifact.bytecode,
  ).getDeployTransaction(...deployment.args);
  const estimate = await wallet.estimateGas(transaction);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null) throw new ConfigurationError("Gas price unavailable");
  const gasLimit = (estimate * 125n + 99n) / 100n;
  const costCeiling = gasLimit * gasPrice;
  checkCustodyBudget(await custodyRecords(), action, deployment.chainId, costCeiling);
  if ((await rpc.getBalance(wallet.address)) < costCeiling)
    throw new ConfigurationError("Insufficient testnet gas");
  const common = {
    action,
    chainId: deployment.chainId,
    contractName: deployment.name,
    constructorArguments: deployment.args,
    artifactSha256,
    creationBytecodeHash: artifact.bytecodeHash,
    calldataHash: keccak256(transaction.data),
    costCeiling,
  };
  await recordCustody({
    ...common,
    state: "planned",
    evidenceKind: "live-read-verified",
    estimate,
    gasLimit,
    gasPrice,
  });
  if (broadcast) {
    const lock = await open(
      `${repositoryRoot}evidence/custody/${action}.submission-lock`,
      "wx",
      0o600,
    );
    await lock.close();
    checkCustodyBudget(await custodyRecords(), action, deployment.chainId, costCeiling);
    const nonce = await wallet.getNonce("pending");
    await recordCustody({ ...common, state: "prepared", evidenceKind: "proposed", nonce });
    const response = await wallet.sendTransaction({
      ...transaction,
      nonce,
      gasLimit,
      gasPrice,
      type: 0,
    });
    await recordCustody({
      ...common,
      state: "submitted",
      evidenceKind: "proposed",
      nonce,
      transactionHash: response.hash,
    });
    const receipt = await response.wait(1, 45000);
    if (!receipt)
      throw new ConfigurationError("Receipt unavailable; reconcile submitted hash before retry");
    const rawReceipt: unknown = receipt.toJSON();
    await recordCustody({
      ...common,
      state: receipt.status === 1 ? "mined" : "reverted",
      evidenceKind: "live-testnet-mined",
      transactionHash: response.hash,
      contractAddress: receipt.contractAddress,
      receipt: rawReceipt,
    });
    if (receipt.status !== 1 || !receipt.contractAddress)
      throw new ConfigurationError("Custody deployment reverted or missing address");
  }
} catch (error: unknown) {
  await recordCustody({
    action,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  rpc.destroy();
}
