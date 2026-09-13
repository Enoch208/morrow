import { mkdir, writeFile } from "node:fs/promises";
import { formatEther } from "ethers";
import { contractArtifact } from "./artifact.ts";
import {
  cc3Rpc,
  localConfiguration,
  provider,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";
import { spikeAddress, spikeRecords } from "./spike-log.ts";

const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const records = await spikeRecords();
  const mined = records.filter((record) => record.state === "mined");
  if (mined.length !== 6) throw new Error("Stage A requires six mined actions");
  const costs = { sepoliaWei: 0n, cc3Wei: 0n };
  const transactions = [];
  for (const record of mined) {
    if (typeof record.transactionHash !== "string") throw new Error("Missing mined hash");
    const rpc = record.chainId === "11155111" ? source : destination;
    const receipt = await rpc.getTransactionReceipt(record.transactionHash);
    if (receipt?.status !== 1) throw new Error("Mined receipt missing or unsuccessful");
    const block = await rpc.getBlock(receipt.blockHash);
    if (!block) throw new Error("Mined block unavailable");
    const cost = receipt.gasUsed * receipt.gasPrice;
    const rawBlock: unknown = block.toJSON();
    const rawReceipt: unknown = receipt.toJSON();
    if (record.chainId === "11155111") costs.sepoliaWei += cost;
    else costs.cc3Wei += cost;
    transactions.push({
      action: record.action,
      chainId: record.chainId,
      block: rawBlock,
      receipt: rawReceipt,
      gasCostWei: cost.toString(),
    });
  }
  const nativeChecks = records.filter((record) => record.state === "native-verified");
  const refusal = records.find(
    (record) => record.state === "semantic-refusal" && record.rejection === "WrongEmitter",
  );
  const acceptance = records.find(
    (record) => record.state === "checked" && record.action === "prove-approved",
  );
  if (!refusal || !acceptance || nativeChecks.length !== 2)
    throw new Error("Missing spike proof checks");
  const receiver = await spikeAddress("deploy-receiver");
  const abi = contractArtifact("NativeSpikeReceiver").abi;
  const finalized = await destination.getBlock("finalized");
  if (!finalized) throw new Error("Finalized destination block unavailable");
  const rawFinalized: unknown = finalized.toJSON();
  const rawTotal = await destination.call({
    to: receiver,
    data: abi.encodeFunctionData("acceptedTotal"),
    blockTag: finalized.number,
  });
  if (abi.decodeFunctionResult("acceptedTotal", rawTotal)[0] !== 23n)
    throw new Error("Unexpected finalized total");
  const report = {
    observedAt: new Date().toISOString(),
    evidenceKind: "live-read-verified",
    stageA: "passed",
    g1b: "blocked",
    implementationCommit: null,
    implementationCommitBlocker:
      "No repository commit exists; deployed artifacts are archived separately",
    transactions,
    costs: { sepoliaEth: formatEther(costs.sepoliaWei), cc3TestnetCtc: formatEther(costs.cc3Wei) },
    finalizedState: { block: rawFinalized, receiver, acceptedTotalRaw: rawTotal },
    proofs: nativeChecks.map((record) => ({
      action: record.action,
      observedNativeValidAt: record.observedAt,
      proofPath: record.proofPath,
      proofHash: record.proofHash,
      receiptLocalLogIndex: record.receiptLocalLogIndex,
      eventKey: record.eventKey,
    })),
    refusal,
    acceptance,
    timingLimitations:
      "Polling observed the required attested frontier at 2026-09-12T22:17:24.539Z. Per-request proof construction duration was not instrumented. Native-validation timestamps upper-bound source-inclusion-to-proof-ready latency; only two samples exist. Observed timings are operational measurements, never security bounds.",
  };
  const path = `evidence/spike/report-${Date.now().toString()}.json`;
  await mkdir(`${repositoryRoot}evidence/spike`, { recursive: true });
  await writeFile(`${repositoryRoot}${path}`, JSON.stringify(report, null, 2), { flag: "wx" });
  process.stdout.write(
    JSON.stringify({
      path,
      stageA: report.stageA,
      costs: report.costs,
      finalizedBlock: finalized.number,
    }) + "\n",
  );
} finally {
  source.destroy();
  destination.destroy();
}
