import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import { ConfigurationError } from "./errors.ts";

export async function waitForReceipt(
  hash: string,
  providers: readonly JsonRpcProvider[],
  timeoutMs = 300_000,
): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const rpc of providers) {
      const receipt = await rpc.getTransactionReceipt(hash).catch((error: unknown) => {
        process.stderr.write(
          `receipt poll failed: ${error instanceof Error ? error.message : "unknown"}\n`,
        );
        return null;
      });
      if (receipt) return receipt;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new ConfigurationError("Receipt unavailable after polling; reconcile submitted hash");
}
