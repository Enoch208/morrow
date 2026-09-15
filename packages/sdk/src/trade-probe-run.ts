import { keccak256 } from "ethers";
import type { JsonRpcProvider, Wallet } from "ethers";
import { open } from "node:fs/promises";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { ConfigurationError } from "./environment.ts";
import { waitForReceipt } from "./receipt-wait.ts";
import { minedTrade, recordTrade, tradeDirectory, tradeTerms } from "./trade-log.ts";
import { probeRequest, probeSucceeded, replayedRefusal } from "./trade-probe.ts";
import type { ProbeStep } from "./trade-probe.ts";

const refusal = "InsufficientAttestedDepth";

export async function runProbe(
  step: ProbeStep,
  wallet: Wallet,
  rpc: JsonRpcProvider,
  records: readonly Record<string, unknown>[],
  options: BrowserActionOptions,
  broadcast: boolean,
): Promise<void> {
  const expectsRefusal = step === "fund-shallow-refused";
  const { to, data, facts } = await probeRequest(
    step,
    tradeTerms(records),
    minedTrade(records, "reserve").transactionHash,
    options,
  );
  const call = { from: wallet.address, to, data };
  const simulated = expectsRefusal
    ? await replayedRefusal(rpc, call, await rpc.getBlockNumber())
    : undefined;
  if (expectsRefusal && simulated !== refusal)
    throw new ConfigurationError(`Expected ${refusal}, simulated ${simulated ?? "success"}`);
  const gasLimit = expectsRefusal ? 600_000n : ((await wallet.estimateGas(call)) * 125n) / 100n;
  const common = {
    step,
    role: expectsRefusal ? "BUYER" : "PAYER",
    chainId: 102031n,
    sender: wallet.address,
    to,
    calldataHash: keccak256(data),
    gasLimit,
    ...facts,
    ...(expectsRefusal ? { expectedError: refusal, simulatedError: simulated } : {}),
  };
  await recordTrade({ ...common, state: "planned", evidenceKind: "live-read-verified" });
  if (!broadcast) return;
  const lock = await open(`${tradeDirectory}/${step}.submission-lock`, "wx", 0o600);
  await lock.close();
  const response = await wallet.sendTransaction({ to, data, gasLimit });
  await recordTrade({
    ...common,
    state: "submitted",
    evidenceKind: "proposed",
    transactionHash: response.hash,
  });
  const receipt = await waitForReceipt(response.hash, [rpc]);
  const replayed = expectsRefusal
    ? await replayedRefusal(rpc, call, receipt.blockNumber - 1)
    : undefined;
  const succeeded = probeSucceeded(step, receipt, replayed);
  await recordTrade({
    ...common,
    state: succeeded ? (expectsRefusal ? "refused" : "mined") : "unexpected",
    evidenceKind: "live-testnet-mined",
    transactionHash: response.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
    gasUsed: receipt.gasUsed,
    logCount: receipt.logs.length,
    ...(expectsRefusal ? { replayedError: replayed } : {}),
  });
  if (!succeeded) throw new ConfigurationError("Probe outcome differs from expectation");
}
