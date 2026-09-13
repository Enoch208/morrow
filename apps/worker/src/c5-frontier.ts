import { readNative } from "@morrow/sdk/src/native.ts";
import { provider, cc3Rpc } from "@morrow/sdk/src/environment.ts";
import { ConfigurationError } from "@morrow/sdk/src/errors.ts";
import type { C5Job, C5Row } from "./c5-state.ts";

export async function c5Frontier(job: C5Job, records: readonly C5Row[]) {
  if (!job.operation.startsWith("proof-")) return null;
  const sourceAction = job.action.slice(0, -"-proof".length);
  const source = [...records]
    .reverse()
    .find(
      (row) =>
        row.action === sourceAction &&
        (row.state === "reservation-verified" ||
          row.state === "assignment-verified" ||
          row.state === "cancellation-verified"),
    );
  if (
    !source ||
    typeof source.blockNumber !== "number" ||
    !Number.isSafeInteger(source.blockNumber)
  )
    throw new ConfigurationError("C5 proof requires verified source block");
  const rpc = provider(cc3Rpc);
  try {
    const chain: unknown = await rpc.send("eth_chainId", []);
    if (typeof chain !== "string" || BigInt(chain) !== 102031n)
      throw new ConfigurationError("C5 frontier wrong chain");
    const block = await rpc.getBlock("finalized");
    if (!block?.hash) throw new ConfigurationError("C5 frontier block unavailable");
    const native = await readNative(
      rpc,
      "chainInfo",
      "get_latest_attestation_height_and_hash",
      [1],
      block.number,
    );
    const height: unknown = native.decoded[0];
    if (typeof height !== "bigint") throw new ConfigurationError("Invalid native C5 frontier");
    const canonical: unknown = await rpc.send("eth_getBlockByNumber", [
      `0x${block.number.toString(16)}`,
      false,
    ]);
    if (
      !canonical ||
      typeof canonical !== "object" ||
      !("hash" in canonical) ||
      canonical.hash !== block.hash
    )
      throw new ConfigurationError("C5 frontier snapshot reorganized");
    return {
      ready: height >= BigInt(source.blockNumber),
      sourceBlock: source.blockNumber,
      nativeHeight: height.toString(),
      destinationBlock: block.number,
      destinationBlockHash: block.hash,
      destinationTimestamp: block.timestamp,
      calldata: native.calldata,
      raw: native.raw,
    };
  } finally {
    rpc.destroy();
  }
}
