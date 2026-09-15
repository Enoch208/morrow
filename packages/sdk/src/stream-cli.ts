import { keccak256 } from "ethers";
import type { JsonRpcProvider, TransactionReceipt, TransactionRequest, Wallet } from "ethers";
import { open } from "node:fs/promises";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";
import {
  expectedRefusal,
  streamChain,
  streamOutcome,
  streamSigner,
  streamStep,
} from "./stream-config.ts";
import type { StreamStep } from "./stream-config.ts";
import { recordStream, streamDirectory, streamRecords, streamTerms } from "./stream-log.ts";
import { waitForReceipt } from "./receipt-wait.ts";
import { readStreamAssignment, validateStreamAssignment } from "./stream-preflight.ts";
import { vaultInterface } from "./stream-setup.ts";
import { createdStreamId } from "./stream-evidence.ts";
import { streamRequest } from "./stream-steps.ts";

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
  if (step === "assign")
    validateStreamAssignment(
      await readStreamAssignment(source, destination, streamTerms(records)),
      streamTerms(records),
    );
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
    const replayed = refusal
      ? await refusalReason(rpc, wallet, request, receipt.blockNumber - 1)
      : undefined;
    const outcome = streamOutcome(refusal, receipt.status, receipt.logs.length, replayed);
    const ok = outcome !== "unexpected";
    await recordStream({
      ...common,
      state: outcome,
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
