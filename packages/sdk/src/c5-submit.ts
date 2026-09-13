import { keccak256 } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { verifyCampaignContract } from "./contract-reads.ts";
import { c5ClaimId, c5Directory, c5Record, c5Records, recordC5 } from "./c5-log.ts";
import { checkC5Budget } from "./c5-budget.ts";
import { reserveC5Budget } from "./c5-budget-reservation.ts";
import { requireC5Action, validateC5Call } from "./c5-call-policy.ts";
import { assertC5ReadinessTimestamp } from "./c5-readiness-policy.ts";
import { persistThenBroadcast } from "./submission-intent.ts";
import { localConfiguration, localRole } from "./environment.ts";
import { ConfigurationError } from "./errors.ts";
import { assertC5Locks } from "./c5-locks.ts";
import { assertC5SigningWindow } from "./c5-signing-window.ts";

export interface C5Context {
  readonly source: JsonRpcProvider;
  readonly destination: JsonRpcProvider;
}

export async function submitC5(
  context: C5Context,
  action: string,
  role: keyof typeof campaignActors,
  contract: keyof typeof campaignContracts,
  method: string,
  args: readonly unknown[],
  broadcast: boolean,
  metadata: Record<string, unknown> = {},
  beforeSign?: () => Promise<void>,
) {
  const { address, chainId } = campaignContracts[contract];
  const rpc = chainId === 11155111n ? context.source : context.destination;
  const independent = method === "approve" || method === "createClaim";
  const claimId = independent ? 0n : await c5ClaimId();
  const data = validateC5Call(action, role, contract, method, args, claimId);
  await c5Record("c5-approval", "authorized");
  await c5Record("c5-integration-readiness", "native-verified");
  const ready = await c5Record("c5-readiness", "ready");
  assertC5ReadinessTimestamp(
    ready.observedAt,
    Date.now(),
    ["c5-create", "c5-r1-reserve", "c5-approve-source"].includes(action),
  );
  if (action === "c5-r2-assign" && !beforeSign)
    throw new ConfigurationError("C5 assignment requires final signing preflight");
  await verifyCampaignContract(rpc, contract);
  const sender = campaignActors[role];
  const transaction = { from: sender, to: address, data, value: 0n };
  const estimate = await rpc.estimateGas(transaction);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null || gasPrice <= 0n) throw new ConfigurationError("C5 gas price unavailable");
  const gasLimit = (estimate * 125n + 99n) / 100n;
  const costCeiling = gasLimit * gasPrice;
  await assertC5Locks(c5Directory, await c5Records());
  checkC5Budget(await c5Records(), action, chainId, costCeiling);
  if ((await rpc.getBalance(sender)) < costCeiling)
    throw new ConfigurationError("Insufficient C5 gas balance");
  const common = {
    ...metadata,
    action,
    chainId,
    sender,
    contract: address,
    method,
    calldataHash: keccak256(data),
    costCeiling,
  };
  await recordC5({
    ...common,
    state: "planned",
    evidenceKind: "live-read-verified",
    estimate,
    gasPrice,
    gasLimit,
  });
  if (!broadcast) return null;
  const [nonce, latestNonce] = await Promise.all([
    rpc.getTransactionCount(sender, "pending"),
    rpc.getTransactionCount(sender, "latest"),
  ]);
  if (nonce !== latestNonce)
    throw new ConfigurationError("C5 account has unresolved pending nonce");
  const wallet = localRole(localConfiguration(), role);
  if (wallet.address !== sender)
    throw new ConfigurationError("C5 local key differs from approved actor");
  await beforeSign?.();
  if (
    (await rpc.getTransactionCount(sender, "pending")) !== nonce ||
    (await rpc.getTransactionCount(sender, "latest")) !== nonce
  )
    throw new ConfigurationError("C5 account nonce changed during preflight");
  assertC5SigningWindow(action, ready.observedAt);
  const signed = await wallet.signTransaction({
    to: address,
    data,
    value: 0n,
    chainId,
    gasLimit,
    gasPrice,
    nonce,
    type: 0,
  });
  const response = await persistThenBroadcast(
    c5Directory,
    action,
    signed,
    (transactionHash) =>
      reserveC5Budget(
        c5Directory,
        action,
        chainId,
        costCeiling,
        c5Records,
        () => recordC5({
          ...common,
          state: "prepared",
          evidenceKind: "proposed",
          nonce,
          transactionHash,
        }),
      ),
    (raw) => rpc.broadcastTransaction(raw),
    requireC5Action,
  );
  await recordC5({
    ...common,
    state: "submitted",
    evidenceKind: "proposed",
    nonce,
    transactionHash: response.hash,
  });
  const receipt = await rpc.waitForTransaction(response.hash, 1, 45000);
  if (!receipt) throw new ConfigurationError("C5 receipt unavailable; reconcile before retry");
  if (
    receipt.hash !== response.hash ||
    receipt.from !== sender ||
    receipt.to !== address ||
    receipt.gasUsed > gasLimit ||
    receipt.gasPrice !== gasPrice
  )
    throw new ConfigurationError("C5 receipt differs from signed intent or gas ceiling");
  if ((await rpc.getBlock(receipt.blockNumber))?.hash !== receipt.blockHash)
    throw new ConfigurationError("C5 receipt block is not canonical");
  const rawReceipt: unknown = receipt.toJSON();
  await recordC5({
    ...common,
    state: receipt.status === 1 ? "mined" : "reverted",
    evidenceKind: "live-testnet-mined",
    transactionHash: receipt.hash,
    receipt: rawReceipt,
  });
  if (receipt.status !== 1) throw new ConfigurationError("C5 transaction reverted");
  return receipt;
}
