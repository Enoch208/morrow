import { keccak256 } from "ethers";
import type { JsonRpcProvider, Wallet } from "ethers";
import { campaignContracts } from "./campaign-config.ts";
import { verifyCampaignContract } from "./campaign-chain.ts";
import { campaignRecords, recordCampaign } from "./campaign-log.ts";
import { checkCampaignBudget } from "./campaign-budget.ts";
import { ConfigurationError, repositoryRoot } from "./environment.ts";
import { persistThenBroadcast, requireCampaignAction } from "./submission-intent.ts";

export async function submitCampaign(
  rpc: JsonRpcProvider,
  wallet: Wallet,
  action: string,
  contract: keyof typeof campaignContracts,
  method: string,
  args: readonly unknown[],
  broadcast: boolean,
  metadata: Record<string, unknown> = {},
) {
  requireCampaignAction(action);
  const abi = await verifyCampaignContract(rpc, contract);
  const { address, chainId } = campaignContracts[contract];
  const transaction = { to: address, data: abi.encodeFunctionData(method, args), value: 0n };
  const estimate = await wallet.estimateGas(transaction);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null) throw new ConfigurationError("Gas price unavailable");
  const gasLimit = (estimate * 125n + 99n) / 100n;
  const costCeiling = gasLimit * gasPrice;
  checkCampaignBudget(await campaignRecords(), action, chainId, costCeiling);
  if ((await rpc.getBalance(wallet.address)) < costCeiling)
    throw new ConfigurationError("Insufficient campaign gas");
  const common = {
    ...metadata,
    action,
    chainId,
    sender: wallet.address,
    contract: address,
    method,
    calldataHash: keccak256(transaction.data),
    costCeiling,
  };
  await recordCampaign({
    ...common,
    state: "planned",
    evidenceKind: "live-read-verified",
    estimate,
    gasPrice,
    gasLimit,
  });
  if (!broadcast) return null;
  const nonce = await wallet.getNonce("pending");
  const signedTransaction = await wallet.signTransaction({
    ...transaction,
    chainId,
    gasLimit,
    gasPrice,
    nonce,
    type: 0,
  });
  const response = await persistThenBroadcast(
    `${repositoryRoot}evidence/campaign`,
    action,
    signedTransaction,
    async (transactionHash) => {
      checkCampaignBudget(await campaignRecords(), action, chainId, costCeiling);
      await recordCampaign({
        ...common,
        state: "prepared",
        evidenceKind: "proposed",
        nonce,
        transactionHash,
      });
    },
    (raw) => rpc.broadcastTransaction(raw),
  );
  await recordCampaign({
    ...common,
    state: "submitted",
    evidenceKind: "proposed",
    nonce,
    transactionHash: response.hash,
  });
  const receipt = await response.wait(1, 45000);
  if (!receipt)
    throw new ConfigurationError("Campaign receipt missing; reconcile hash before retry");
  const rawReceipt: unknown = receipt.toJSON();
  await recordCampaign({
    ...common,
    state: receipt.status === 1 ? "mined" : "reverted",
    evidenceKind: "live-testnet-mined",
    transactionHash: response.hash,
    receipt: rawReceipt,
  });
  if (receipt.status !== 1) throw new ConfigurationError("Campaign transaction reverted");
  return receipt;
}
