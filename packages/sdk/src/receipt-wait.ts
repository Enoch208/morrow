import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import { ConfigurationError } from "./errors.ts";

export async function waitForReceipt(
  hash: string,
  providers: readonly JsonRpcProvider[],
  timeoutMs = 300_000,
): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "none";
  while (Date.now() < deadline) {
    for (const rpc of providers) {
      try {
        const receipt = await rpc.getTransactionReceipt(hash);
        if (receipt) return receipt;
      } catch (error: unknown) {
        lastFailure = error instanceof Error ? error.message.slice(0, 120) : "unknown";
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new ConfigurationError(
    `Receipt unavailable after polling (last failure: ${lastFailure}); reconcile submitted hash`,
  );
}
