import { open, readdir } from "node:fs/promises";
import { join } from "node:path";
import { keccak256, Transaction } from "ethers";
import { ConfigurationError } from "./environment.ts";
import { json } from "./campaign-log.ts";

export function requireCampaignAction(action: string): void {
  if (
    !/^(approve-source|supply-buyer|approve-settlement|(gate|a|b)-(create|reserve|fund|assign|cancel|settle|refund|redeem|withdraw)|withdraw-fee)$/.test(
      action,
    )
  )
    throw new ConfigurationError("Unsupported campaign action");
}

export async function submissionLocks(directory: string): Promise<ReadonlySet<string>> {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return new Set();
    throw error;
  }
  const actions = names
    .filter((name) => name.endsWith(".submission-lock"))
    .map((name) => name.slice(0, -".submission-lock".length));
  actions.forEach(requireCampaignAction);
  return new Set(actions);
}

export async function persistThenBroadcast<T extends { readonly hash: string }>(
  directory: string,
  action: string,
  signedTransaction: string,
  prepare: (transactionHash: string) => Promise<void>,
  broadcast: (signedTransaction: string) => Promise<T>,
): Promise<T> {
  requireCampaignAction(action);
  const transaction = Transaction.from(signedTransaction);
  const hash = transaction.hash;
  if (
    !hash ||
    !transaction.from ||
    !transaction.to ||
    transaction.value !== 0n ||
    (transaction.chainId !== 11155111n && transaction.chainId !== 102031n)
  )
    throw new ConfigurationError("Submission intent must be a signed zero-value testnet call");
  const lock = await open(join(directory, `${action}.submission-lock`), "wx", 0o600);
  try {
    await lock.writeFile(
      json({
        version: 1,
        action,
        transactionHash: hash,
        chainId: transaction.chainId,
        sender: transaction.from,
        contract: transaction.to,
        nonce: transaction.nonce,
        calldataHash: keccak256(transaction.data),
        gasLimit: transaction.gasLimit,
        gasPrice: transaction.gasPrice,
        createdAt: new Date().toISOString(),
      }) + "\n",
    );
    await lock.sync();
  } finally {
    await lock.close();
  }
  const parent = await open(directory, "r");
  try {
    await parent.sync();
  } finally {
    await parent.close();
  }
  await prepare(hash);
  const response = await broadcast(signedTransaction);
  if (response.hash !== hash)
    throw new ConfigurationError(
      "Broadcast returned another transaction hash; reconcile original intent",
    );
  return response;
}
