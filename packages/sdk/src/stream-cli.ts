import { keccak256 } from "ethers";
import type { JsonRpcProvider, TransactionReceipt, TransactionRequest, Wallet } from "ethers";
import { open } from "node:fs/promises";
import { saleIdentity } from "./canonical.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { decodedInteger, decodedTuple } from "./decoded-state.ts";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";
import { expectedRefusal, streamChain, streamSigner, streamStep } from "./stream-config.ts";
import type { StreamStep } from "./stream-config.ts";
import {
  recordStream,
  streamDirectory,
  streamField,
  streamRecords,
  streamTerms,
} from "./stream-log.ts";
import { waitForReceipt } from "./receipt-wait.ts";
import { vaultInterface } from "./stream-setup.ts";
import { createdStreamId, streamRequest } from "./stream-steps.ts";

const sourceRpcUrl = "https://sepolia.gateway.tenderly.co";

function receiptFacts(step: StreamStep, receipt: TransactionReceipt) {
  if (step === "create-stream" || step === "create-cancelable-stream")
    return { streamId: createdStreamId(receipt) };
  if (step === "wrap-stream") {
    const event = vaultInterface.getEvent("ClaimFunded");
    const log = receipt.logs.find((entry) => entry.topics[0] === event?.topicHash);
    if (!log?.topics[1]) throw new ConfigurationError("ClaimFunded log missing");
    return { claimId: BigInt(log.topics[1]) };
  }
  return receipt.contractAddress ? { contractAddress: receipt.contractAddress } : {};
}

async function assertBoundBeforeAssignment(destination: JsonRpcProvider): Promise<void> {
  const records = await streamRecords();
  const terms = streamTerms(records);
  const market = streamField(records, "deploy-stream-market", "contractAddress");
  const raw = await destination.call({
    to: market,
    data: contractInterfaces.market.encodeFunctionData("getSale", [saleIdentity(terms).saleId]),
    blockTag: "finalized",
  });
  const sale = decodedTuple(contractInterfaces.market.decodeFunctionResult("getSale", raw)[0], 2);
  if (decodedInteger(sale[1]) !== 1n)
    throw new ConfigurationError("Buyer funds are not BOUND at a finalized destination block");
}

async function refusalReason(
  rpc: JsonRpcProvider,
  wallet: Wallet,
  request: TransactionRequest,
  block: number,
) {
  try {
    await rpc.call({ ...request, from: wallet.address, blockTag: block });
    return undefined;
  } catch (error: unknown) {
    const data =
      typeof error === "object" && error !== null && "data" in error ? String(error.data) : "";
    return vaultInterface.parseError(data)?.name;
  }
}

const step = streamStep(process.argv[2]);
const broadcast = process.argv.includes("--broadcast");
const chainId = streamChain(step);
const source = provider(sourceRpcUrl);
const destination = provider(cc3Rpc);
const rpc = chainId === 11155111n ? source : destination;
try {
  await requireTestnet(rpc, chainId);
  const records = await streamRecords();
  if (
    records.some(
      (row) => row.step === step && ["submitted", "mined", "refused"].includes(String(row.state)),
    )
  )
    throw new ConfigurationError("Step already submitted; reconcile before retrying");
  if (step === "assign") await assertBoundBeforeAssignment(destination);
  const wallet = localRole(localConfiguration(), streamSigner[step]).connect(rpc);
  const { request, context = {} } = await streamRequest(step, { source, destination, records });
  const refusal = expectedRefusal[step];
  const block = await rpc.getBlockNumber();
  const simulated = refusal ? await refusalReason(rpc, wallet, request, block) : undefined;
  if (refusal && simulated !== refusal)
    throw new ConfigurationError(
      `Expected ${refusal} refusal, simulated ${simulated ?? "success"}`,
    );
  const gasLimit = refusal ? 400_000n : ((await wallet.estimateGas(request)) * 125n) / 100n;
  const common = {
    step,
    role: streamSigner[step],
    chainId,
    sender: wallet.address,
    to: request.to ?? null,
    calldataHash: keccak256(String(request.data)),
    gasLimit,
    ...context,
  };
  await recordStream({
    ...common,
    state: "planned",
    evidenceKind: "live-read-verified",
    ...(refusal ? { expectedError: refusal, simulatedError: simulated } : {}),
  });
  if (broadcast) {
    const lock = await open(`${streamDirectory}/${step}.submission-lock`, "wx", 0o600);
    await lock.close();
    const response = await wallet.sendTransaction({ ...request, gasLimit });
    await recordStream({
      ...common,
      state: "submitted",
      evidenceKind: "proposed",
      transactionHash: response.hash,
    });
    const fallback = provider(
      chainId === 11155111n ? "https://rpc.sepolia.ethpandaops.io" : cc3Rpc,
    );
    const receipt = await waitForReceipt(response.hash, [rpc, fallback]).finally(() => {
      fallback.destroy();
    });
    const ok = refusal ? receipt.status === 0 && receipt.logs.length === 0 : receipt.status === 1;
    const replayed = refusal
      ? await refusalReason(rpc, wallet, request, receipt.blockNumber - 1)
      : undefined;
    await recordStream({
      ...common,
      state: ok ? (refusal ? "refused" : "mined") : "unexpected",
      evidenceKind: "live-testnet-mined",
      transactionHash: response.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
      gasUsed: receipt.gasUsed,
      ...(refusal ? { replayedError: replayed } : receiptFacts(step, receipt)),
    });
    if (!ok) throw new ConfigurationError("Stream step outcome differs from expectation");
  }
} catch (error: unknown) {
  await recordStream({
    step,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
