import { keccak256 } from "ethers";
import { open } from "node:fs/promises";
import { readSaleProgress } from "./browser.ts";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";
import { waitForReceipt } from "./receipt-wait.ts";
import { recordTrade, tradeDirectory, tradeRecords, tradeStep, tradeTerms } from "./trade-log.ts";
import { createdClaimId } from "./trade-claim.ts";
import { prepareTradeStep, tradeChain, tradeSigner } from "./trade-steps.ts";

const sourceRpcUrl = "https://sepolia.gateway.tenderly.co";
const step = tradeStep(process.argv[2]);
const broadcast = process.argv.includes("--broadcast");
const options = { sourceRpcUrl, destinationRpcUrl: cc3Rpc };
const chainId = tradeChain(step);
const rpc = provider(chainId === 11155111n ? sourceRpcUrl : cc3Rpc);

try {
  await requireTestnet(rpc, chainId);
  const records = await tradeRecords();
  if (
    records.some((row) => row.step === step && ["submitted", "mined"].includes(String(row.state)))
  )
    throw new ConfigurationError("Step already submitted; reconcile before retrying");
  const wallet = localRole(localConfiguration(), tradeSigner[step]).connect(rpc);
  const result = await prepareTradeStep(step, wallet.address, records, options);
  if ("skip" in result) {
    await recordTrade({
      step,
      state: "skipped",
      evidenceKind: "live-read-verified",
      reason: result.skip,
    });
  } else {
    const { prepared } = result;
    const context = "context" in result ? result.context : {};
    if (prepared.expectedSigner !== wallet.address || prepared.chainId !== chainId)
      throw new ConfigurationError("Prepared signer or chain differs from the local role");
    const common = {
      step,
      role: tradeSigner[step],
      chainId,
      sender: wallet.address,
      to: prepared.to,
      calldataHash: keccak256(prepared.data),
      checkedBlock: prepared.checkedBlock,
      ...context,
    };
    await recordTrade({ ...common, state: "planned", evidenceKind: "live-read-verified" });
    if (broadcast) {
      const lock = await open(`${tradeDirectory}/${step}.submission-lock`, "wx", 0o600);
      await lock.close();
      const response = await wallet.sendTransaction({ to: prepared.to, data: prepared.data });
      await recordTrade({
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
      const facts =
        step === "create" && receipt.status === 1
          ? { claimId: createdClaimId(receipt, wallet.address, context) }
          : {};
      const mined = receipt.status === 1;
      await recordTrade({
        ...common,
        ...facts,
        state: mined ? "mined" : "reverted",
        evidenceKind: "live-testnet-mined",
        transactionHash: response.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      });
      if (mined && step !== "drip-buyer" && step !== "approve-claim" && step !== "create") {
        const observed = await readSaleProgress(
          tradeTerms(await tradeRecords()),
          wallet.address,
          options,
        )
          .then((progress) => ({ state: "observed", evidenceKind: "live-read-verified", progress }))
          .catch((error: unknown) => ({
            state: "observation-unavailable",
            evidenceKind: "blocked",
            error: errorSummary(error),
          }));
        await recordTrade({ step, transactionHash: response.hash, ...observed });
      }
      if (!mined) throw new ConfigurationError("Trade step reverted");
    }
  }
} catch (error: unknown) {
  await recordTrade({
    step,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  rpc.destroy();
}
