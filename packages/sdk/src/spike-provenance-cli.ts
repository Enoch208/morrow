import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { keccak256 } from "ethers";
import { contractArtifact } from "./artifact.ts";
import { compiledRuntime, maskImmutables } from "./runtime.ts";
import {
  cc3Rpc,
  errorSummary,
  localConfiguration,
  provider,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";
import { spikeAddress, spikeRecords } from "./spike-log.ts";

const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC configuration");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const records = await spikeRecords();
  const deployments = [];
  for (const action of ["deploy-approved", "deploy-unapproved", "deploy-receiver"]) {
    const entry = records.find((record) => record.action === action && record.state === "mined");
    if (!entry || typeof entry.transactionHash !== "string")
      throw new Error("Missing mined deployment");
    const isReceiver = action === "deploy-receiver";
    const rpc = isReceiver ? destination : source;
    const name = isReceiver ? "NativeSpikeReceiver" : "NativeSpikeEmitter";
    const artifact = contractArtifact(name);
    const runtime = compiledRuntime(name);
    const transaction = await rpc.getTransaction(entry.transactionHash);
    const receipt = await rpc.getTransactionReceipt(entry.transactionHash);
    if (!transaction || receipt?.status !== 1 || !receipt.contractAddress)
      throw new Error("Deployment receipt unavailable or failed");
    const constructorArguments = isReceiver
      ? [await spikeAddress("deploy-approved"), transaction.from]
      : [];
    const expectedCreation =
      artifact.bytecode + artifact.abi.encodeDeploy(constructorArguments).slice(2);
    if (transaction.data.toLowerCase() !== expectedCreation.toLowerCase())
      throw new Error("Deployment initcode differs from compiled artifact");
    const observation = await rpc.getBlock("latest");
    if (!observation) throw new Error("Observation block unavailable");
    const code = await rpc.getCode(receipt.contractAddress, observation.number);
    if (maskImmutables(code, runtime.ranges) !== maskImmutables(runtime.code, runtime.ranges))
      throw new Error("Deployed runtime differs from compiled artifact");
    if (isReceiver) {
      for (const [method, expected] of [
        ["approvedEmitter", constructorArguments[0]],
        ["approvedActor", transaction.from],
      ] as const) {
        const result = await rpc.call({
          to: receipt.contractAddress,
          data: artifact.abi.encodeFunctionData(method),
          blockTag: observation.number,
        });
        const actual: unknown = artifact.abi.decodeFunctionResult(method, result)[0];
        if (
          typeof actual !== "string" ||
          typeof expected !== "string" ||
          actual.toLowerCase() !== expected.toLowerCase()
        )
          throw new Error("Immutable configuration differs from constructor");
      }
    }
    const artifactPath = `${repositoryRoot}deployments/spike/${name}.artifact.json`;
    await mkdir(`${repositoryRoot}deployments/spike`, { recursive: true });
    if (existsSync(artifactPath)) {
      if (readFileSync(artifactPath, "utf8") !== runtime.artifactText)
        throw new Error("Archived artifact changed; do not relabel deployment");
    } else await writeFile(artifactPath, runtime.artifactText, { flag: "wx" });
    deployments.push({
      action,
      chainId: isReceiver ? "102031" : "11155111",
      address: receipt.contractAddress,
      transactionHash: entry.transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      receiptStatus: receipt.status,
      constructorArguments,
      runtimeCodeHash: keccak256(code),
      creationBytecodeHash: artifact.bytecodeHash,
      artifactSha256: createHash("sha256").update(runtime.artifactText).digest("hex"),
      observationBlock: observation.number,
      observationBlockHash: observation.hash,
      creationMatches: true,
      runtimeMatches: true,
    });
  }
  const result = {
    observedAt: new Date().toISOString(),
    evidenceKind: "live-read-verified",
    implementationCommit: null,
    commitBlocker: "Repository has no authorized commit yet",
    deployments,
  };
  const path = `${repositoryRoot}deployments/spike/provenance-${Date.now().toString()}.json`;
  const text = JSON.stringify(result, null, 2);
  await writeFile(path, `${text}\n`, { flag: "wx" });
  process.stdout.write(`${text}\n`);
} catch (error: unknown) {
  process.stderr.write(`${errorSummary(error)}\n`);
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
