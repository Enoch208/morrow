import { isError, keccak256 } from "ethers";
import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import { EvidenceError, integer } from "./checker-rpc.ts";
import { applicationInterfaces, applicationPins, applicationRead } from "./manifest-chain.ts";
import type { DeploymentRole } from "./manifest-types.ts";
import { sourceClaim, sourceRound } from "./source-state.ts";
import { c5Actors } from "./c5-policy.ts";

export async function c5Read(
  rpc: JsonRpcProvider,
  role: DeploymentRole,
  method: string,
  args: string[],
  block: number,
) {
  const result = await applicationRead(rpc, role, method, args, block);
  return {
    ...result,
    decoded: applicationInterfaces[role].decodeFunctionResult(method, result.raw),
  };
}

export async function c5CanonicalBlock(rpc: JsonRpcProvider, height: number, hash: string) {
  const raw: unknown = await rpc.send("eth_getBlockByNumber", [`0x${height.toString(16)}`, false]);
  if (!raw || typeof raw !== "object" || !("hash" in raw) || raw.hash !== hash)
    throw new EvidenceError("C5 historical block is no longer canonical");
}

export async function c5CheckPins(
  rpc: JsonRpcProvider,
  side: "source" | "destination",
  block: number,
) {
  const chain: unknown = await rpc.send("eth_chainId", []);
  if (chain !== (side === "source" ? "0xaa36a7" : "0x18e8f"))
    throw new EvidenceError("C5 RPC chain domain mismatch");
  const roles: DeploymentRole[] =
    side === "source" ? ["vault", "sourceToken"] : ["market", "settlementToken"];
  for (const role of roles) {
    const pin = applicationPins[role];
    if (keccak256(await rpc.getCode(pin.address, block)) !== pin.codeHash)
      throw new EvidenceError("C5 deployed runtime differs from pinned release");
  }
  const decimals = await c5Read(
    rpc,
    side === "source" ? "sourceToken" : "settlementToken",
    "decimals",
    [],
    block,
  );
  if (integer(decimals.decoded[0]) !== 6n) throw new EvidenceError("C5 token units mismatch");
}

export async function c5ReadSource(
  rpc: JsonRpcProvider,
  claimId: string,
  height: number,
  absent = false,
) {
  const block = await rpc.getBlock(height);
  if (!block?.hash) throw new EvidenceError("C5 source history block missing");
  let claim = null;
  let claimRaw: string | null = null;
  try {
    const result = await c5Read(rpc, "vault", "getClaim", [claimId], height);
    claim = sourceClaim(result.decoded[0]);
    claimRaw = result.raw;
  } catch (error: unknown) {
    if (
      !absent ||
      !isError(error, "CALL_EXCEPTION") ||
      error.data !== applicationInterfaces.vault.getError("InvalidClaim")?.selector
    )
      throw error;
  }
  const [first, second, backing, counter, balance] = await Promise.all([
    c5Read(rpc, "vault", "getRound", [claimId, "1"], height),
    c5Read(rpc, "vault", "getRound", [claimId, "2"], height),
    c5Read(rpc, "vault", "totalBacking", [], height),
    c5Read(rpc, "vault", "nextClaimId", [], height),
    c5Read(rpc, "sourceToken", "balanceOf", [applicationPins.vault.address], height),
  ]);
  await c5CanonicalBlock(rpc, height, block.hash);
  return {
    blockNumber: height,
    blockHash: block.hash,
    timestamp: BigInt(block.timestamp),
    claim,
    rounds: [sourceRound(first.decoded[0]), sourceRound(second.decoded[0])] as const,
    backing: integer(backing.decoded[0]),
    nextClaimId: integer(counter.decoded[0]),
    balance: integer(balance.decoded[0]),
    raw: {
      claim: claimRaw,
      rounds: [first.raw, second.raw],
      backing: backing.raw,
      nextClaimId: counter.raw,
      balance: balance.raw,
    },
  };
}

export async function c5ReadMarket(
  rpc: JsonRpcProvider,
  saleIds: readonly string[],
  eventKeys: readonly string[],
  height: number,
) {
  const block = await rpc.getBlock(height);
  if (!block?.hash) throw new EvidenceError("C5 destination history block missing");
  const calls = [
    ...saleIds.map((saleId) => ({ role: "market" as const, method: "getSale", args: [saleId] })),
    ...["totalBound", "totalCredits", "totalLiabilities"].map((method) => ({
      role: "market" as const,
      method,
      args: [],
    })),
    ...[applicationPins.market.address, ...Object.values(c5Actors)].map((actor) => ({
      role: "settlementToken" as const,
      method: "balanceOf",
      args: [actor],
    })),
    ...Object.values(c5Actors).map((actor) => ({
      role: "market" as const,
      method: "credits",
      args: [actor],
    })),
    ...eventKeys.map((key) => ({ role: "market" as const, method: "consumed", args: [key] })),
  ];
  const reads = await Promise.all(
    calls.map((call) => c5Read(rpc, call.role, call.method, call.args, height)),
  );
  await c5CanonicalBlock(rpc, height, block.hash);
  return { blockNumber: height, blockHash: block.hash, timestamp: BigInt(block.timestamp), reads };
}

export async function c5IsolatedTransaction(
  rpc: JsonRpcProvider,
  receipt: TransactionReceipt,
  address: string,
) {
  const logs = await rpc.getLogs({ address, blockHash: receipt.blockHash });
  if (
    logs.some(
      (log) =>
        log.removed || log.blockHash !== receipt.blockHash || log.transactionHash !== receipt.hash,
    )
  )
    throw new EvidenceError(
      "C5 custody block contains additional transactions; explicit reconstruction required",
    );
}
