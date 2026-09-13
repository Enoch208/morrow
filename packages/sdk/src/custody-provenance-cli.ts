import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { formatEther, keccak256 } from "ethers";
import { contractArtifact } from "./artifact.ts";
import { custodyActions, custodyConfiguration } from "./custody-config.ts";
import { custodyAddress, custodyRecords } from "./custody-log.ts";
import { compiledRuntime, maskImmutables } from "./runtime.ts";
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

const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new ConfigurationError("Missing source RPC");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
const payer = localRole(configuration, "PAYER").address;
try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const records = await custodyRecords();
  const deployments = [];
  let sourceCost = 0n;
  let destinationCost = 0n;
  for (const action of custodyActions) {
    const entry = records.find((record) => record.action === action && record.state === "mined");
    if (!entry || typeof entry.transactionHash !== "string")
      throw new ConfigurationError(`Missing mined deployment: ${action}`);
    const expected = await custodyConfiguration(action, payer);
    const rpc = expected.chainId === 11155111n ? source : destination;
    const artifact = contractArtifact(expected.name);
    const runtime = compiledRuntime(expected.name);
    const artifactSha256 = createHash("sha256").update(runtime.artifactText).digest("hex");
    if (artifactSha256 !== entry.artifactSha256)
      throw new ConfigurationError("Compiled artifact changed since deployment");
    const [transaction, receipt, observation] = await Promise.all([
      rpc.getTransaction(entry.transactionHash),
      rpc.getTransactionReceipt(entry.transactionHash),
      rpc.getBlock("latest"),
    ]);
    if (
      !transaction ||
      receipt?.status !== 1 ||
      !receipt.contractAddress ||
      !observation ||
      observation.number < receipt.blockNumber
    )
      throw new ConfigurationError("Deployment unavailable or observation precedes receipt");
    if (
      transaction.from.toLowerCase() !== payer.toLowerCase() ||
      transaction.to !== null ||
      transaction.value !== 0n
    )
      throw new ConfigurationError("Unexpected deployment sender, target or value");
    if (
      transaction.data.toLowerCase() !==
      (artifact.bytecode + artifact.abi.encodeDeploy(expected.args).slice(2)).toLowerCase()
    )
      throw new ConfigurationError("Creation data differs from approved deployment");
    const code = await rpc.getCode(receipt.contractAddress, observation.number);
    if (maskImmutables(code, runtime.ranges) !== maskImmutables(runtime.code, runtime.ranges))
      throw new ConfigurationError("Runtime differs from compiled contract");
    const checks: { method: string; args: readonly unknown[]; expected: string | bigint }[] = [];
    if (action === "source-token" || action === "settlement-token") {
      checks.push(
        {
          method: "name",
          args: [],
          expected:
            action === "source-token" ? "Morrow Source Test Token" : "Morrow Settlement Test Token",
        },
        { method: "symbol", args: [], expected: action === "source-token" ? "mSRC" : "mSET" },
        { method: "decimals", args: [], expected: 6n },
        { method: "totalSupply", args: [], expected: 1000000000000n },
        { method: "balanceOf", args: [payer], expected: 1000000000000n },
      );
    } else if (action === "vault") {
      checks.push(
        { method: "SOURCE_TOKEN", args: [], expected: await custodyAddress("source-token") },
        { method: "totalBacking", args: [], expected: 0n },
        { method: "nextClaimId", args: [], expected: 1n },
      );
    } else {
      checks.push(
        { method: "SOURCE_VAULT", args: [], expected: await custodyAddress("vault") },
        { method: "SOURCE_TOKEN", args: [], expected: await custodyAddress("source-token") },
        {
          method: "SETTLEMENT_TOKEN",
          args: [],
          expected: await custodyAddress("settlement-token"),
        },
        { method: "FEE_RECIPIENT", args: [], expected: payer },
        ...["totalLiabilities", "totalBound", "totalCredits"].map((method) => ({
          method,
          args: [],
          expected: 0n,
        })),
        { method: "FEE_BPS", args: [], expected: 50n },
      );
    }
    const verifiedReads = [];
    for (const check of checks) {
      const calldata = artifact.abi.encodeFunctionData(check.method, check.args);
      const raw = await rpc.call({
        to: receipt.contractAddress,
        data: calldata,
        blockTag: observation.number,
      });
      const actual: unknown = artifact.abi.decodeFunctionResult(check.method, raw)[0];
      const valid =
        typeof actual === "bigint"
          ? actual === check.expected
          : typeof actual === "string" &&
            typeof check.expected === "string" &&
            actual.toLowerCase() === check.expected.toLowerCase();
      if (!valid) throw new ConfigurationError(`Unexpected ${action}.${check.method}`);
      verifiedReads.push({ ...check, actual, calldata, raw });
    }
    const cost = receipt.gasUsed * receipt.gasPrice;
    if (expected.chainId === 11155111n) sourceCost += cost;
    else destinationCost += cost;
    const rawReceipt: unknown = receipt.toJSON();
    deployments.push({
      action,
      chainId: expected.chainId,
      contractName: expected.name,
      address: receipt.contractAddress,
      transactionHash: transaction.hash,
      constructorArguments: expected.args,
      artifactSha256,
      artifactPath: `deployments/custody/${expected.name}-${artifactSha256}.artifact.json`,
      runtimeCodeHash: keccak256(code),
      creationBytecodeHash: artifact.bytecodeHash,
      receipt: rawReceipt,
      observationBlock: observation.number,
      observationBlockHash: observation.hash,
      creationMatches: true,
      runtimeMatches: true,
      verifiedReads,
    });
  }
  const report = {
    observedAt: new Date().toISOString(),
    evidenceKind: "live-read-verified",
    implementationCommit: null,
    commitBlocker: "No repository commit exists",
    custodyDeployed: true,
    g1bPassed: false,
    fundingBlocker:
      "No claim or purchase funded; separate exact funding terms and deadlines require approval",
    costs: { sepoliaEth: formatEther(sourceCost), cc3TestnetCtc: formatEther(destinationCost) },
    deployments,
  };
  const path = `deployments/custody/provenance-${Date.now().toString()}.json`;
  await writeFile(
    `${repositoryRoot}${path}`,
    JSON.stringify(
      report,
      (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      path,
      costs: report.costs,
      deployments: deployments.map(({ action, address, transactionHash }) => ({
        action,
        address,
        transactionHash,
      })),
    }) + "\n",
  );
} catch (error: unknown) {
  process.stderr.write(errorSummary(error) + "\n");
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
