import { ContractFactory, getAddress, Interface, keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { appendFile, mkdir, open } from "node:fs/promises";
import { contractArtifact } from "./artifact.ts";
import { json } from "./campaign-log.ts";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
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
import { waitForReceipt } from "./receipt-wait.ts";
import { compiledRuntime, maskImmutables } from "./runtime.ts";

const directory = `${repositoryRoot}evidence/market-v2`;
const pins = new Interface([
  "function SETTLEMENT_TOKEN() view returns (address)",
  "function SOURCE_VAULT() view returns (address)",
  "function SOURCE_TOKEN() view returns (address)",
  "function FEE_RECIPIENT() view returns (address)",
  "function FEE_BPS() view returns (uint16)",
]);
const constructorArguments = [
  campaignContracts.settlementToken.address,
  campaignContracts.vault.address,
  campaignContracts.sourceToken.address,
  campaignActors.PAYER,
  50n,
] as const;

async function record(value: Record<string, unknown>) {
  await mkdir(directory, { recursive: true });
  const line = json({ observedAt: new Date().toISOString(), ...value });
  await appendFile(`${directory}/actions.jsonl`, line + "\n", { flush: true });
  process.stdout.write(line + "\n");
}

async function deployedPins(rpc: JsonRpcProvider, address: string, blockTag: number) {
  const names = ["SETTLEMENT_TOKEN", "SOURCE_VAULT", "SOURCE_TOKEN", "FEE_RECIPIENT", "FEE_BPS"];
  return Promise.all(
    names.map(async (name) => {
      const raw = await rpc.call({ to: address, data: pins.encodeFunctionData(name), blockTag });
      const [value]: unknown[] = pins.decodeFunctionResult(name, raw);
      return typeof value === "string" ? getAddress(value) : value;
    }),
  );
}

async function verifyDeployment(rpc: JsonRpcProvider, address: string, blockNumber: number) {
  const compiled = compiledRuntime("MorrowMarketV2");
  const code = await rpc.getCode(address, blockNumber);
  const runtimeMatches =
    maskImmutables(code, compiled.ranges) === maskImmutables(compiled.code, compiled.ranges);
  const immutables = await deployedPins(rpc, address, blockNumber);
  const pinsMatch = immutables.every((value, index) => value === constructorArguments[index]);
  return { runtimeMatches, pinsMatch, codeHash: keccak256(code), immutables };
}

const broadcast = process.argv.includes("--broadcast");
const rpc = provider(cc3Rpc);
try {
  await requireTestnet(rpc, 102031n);
  const wallet = localRole(localConfiguration(), "PAYER").connect(rpc);
  const artifact = contractArtifact("MorrowMarketV2");
  const request = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(
    ...constructorArguments,
  );
  const gasLimit = ((await wallet.estimateGas(request)) * 125n) / 100n;
  const common = {
    step: "deploy-trade-market",
    role: "PAYER",
    chainId: 102031n,
    sender: wallet.address,
    calldataHash: keccak256(request.data),
    creationBytecodeHash: artifact.bytecodeHash,
    constructorArguments,
    gasLimit,
  };
  await record({ ...common, state: "planned", evidenceKind: "live-read-verified" });
  if (broadcast) {
    const lock = await open(`${directory}/deploy-trade-market.submission-lock`, "wx", 0o600);
    await lock.close();
    const response = await wallet.sendTransaction({ ...request, gasLimit });
    await record({
      ...common,
      state: "submitted",
      evidenceKind: "proposed",
      transactionHash: response.hash,
    });
    const receipt = await waitForReceipt(response.hash, [rpc]);
    if (receipt.status !== 1 || !receipt.contractAddress)
      throw new ConfigurationError("Market deployment reverted");
    const verified = await verifyDeployment(rpc, receipt.contractAddress, receipt.blockNumber);
    await record({
      ...common,
      state: verified.runtimeMatches && verified.pinsMatch ? "mined" : "unexpected",
      evidenceKind: "live-testnet-mined",
      transactionHash: response.hash,
      blockNumber: receipt.blockNumber,
      contractAddress: receipt.contractAddress,
      ...verified,
    });
    if (!verified.runtimeMatches || !verified.pinsMatch)
      throw new ConfigurationError("Deployed market differs from the compiled artifact or pins");
  }
} catch (error: unknown) {
  await record({
    step: "deploy-trade-market",
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  rpc.destroy();
}
