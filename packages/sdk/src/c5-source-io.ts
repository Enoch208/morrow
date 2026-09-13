import { toQuantity, ZeroAddress, ZeroHash } from "ethers";
import { campaignActors, campaignContracts } from "./campaign-config.ts";
import { c5Terms } from "./c5-config.ts";
import { campaignRead, contractInterfaces } from "./contract-reads.ts";
import {
  decodedClaim,
  decodedHash,
  decodedInteger,
  decodedTerms,
  decodedTuple,
} from "./decoded-state.ts";
import type { C5Context } from "./c5-submit.ts";
import type { C5SourceRound, C5SourceSnapshot } from "./c5-source-checks.ts";
import { ConfigurationError } from "./errors.ts";

export interface C5SourceReceipt {
  status: number | null;
  logs: readonly { address: string; topics: readonly string[]; data: string }[];
}

export async function sourceSnapshot(
  context: C5Context,
  blockNumber: number,
  claimId: bigint | null,
) {
  const start = await context.source.getBlock(blockNumber);
  if (!start?.hash) throw new ConfigurationError("C5 snapshot block unavailable");
  const read = async (
    kind: "vault" | "sourceToken",
    method: string,
    args: readonly unknown[] = [],
  ) => {
    const result = await campaignRead(context.source, kind, method, args, blockNumber);
    if (contractInterfaces[kind].encodeFunctionResult(method, result.decoded) !== result.raw)
      throw new ConfigurationError("Noncanonical C5 source response");
    return result;
  };
  const addresses = {
    payer: campaignActors.PAYER,
    seller: campaignActors.SELLER,
    buyer: campaignActors.BUYER,
    vault: campaignContracts.vault.address,
  };
  const [backing, ...balances] = await Promise.all([
    read("vault", "totalBacking"),
    ...Object.values(addresses).map((address) => read("sourceToken", "balanceOf", [address])),
  ]);
  if (balances.length !== 4) throw new ConfigurationError("Missing C5 source accounting");
  const claimRead = claimId === null ? null : await read("vault", "getClaim", [claimId]);
  const allowance = await read("sourceToken", "allowance", [
    campaignActors.PAYER,
    campaignContracts.vault.address,
  ]);
  const rounds: [C5SourceRound | null, C5SourceRound | null] = [null, null];
  const roundRaw: (string | null)[] = [null, null];
  if (claimId !== null) {
    for (const index of [0, 1] as const) {
      const result = await read("vault", "getRound", [claimId, BigInt(index + 1)]);
      roundRaw[index] = result.raw;
      const tuple = decodedTuple(result.decoded[0], 4);
      if (
        decodedInteger(tuple[1]) === 0n &&
        (decodedHash(tuple[2]) !== ZeroHash ||
          decodedHash(tuple[3]) !== ZeroHash ||
          !Object.values(decodedTerms(tuple[0])).every(
            (value) => value === 0n || value === ZeroAddress,
          ))
      )
        throw new ConfigurationError("Nonempty absent C5 source round");
      if (decodedInteger(tuple[1]) !== 0n)
        rounds[index] = {
          terms: decodedTerms(tuple[0]),
          state: decodedInteger(tuple[1]),
          saleId: decodedHash(tuple[2]),
          termsHash: decodedHash(tuple[3]),
        };
    }
  }
  const amounts = balances.map((balance) => decodedInteger(balance.decoded[0]));
  const [payer, seller, buyer, vault] = amounts;
  if (payer === undefined || seller === undefined || buyer === undefined || vault === undefined)
    throw new ConfigurationError("Missing C5 token balance");
  const snapshot: C5SourceSnapshot = {
    claim: claimRead && claimId !== null ? decodedClaim(claimRead.decoded[0], claimId) : null,
    rounds,
    backing: decodedInteger(backing.decoded[0]),
    allowance: decodedInteger(allowance.decoded[0]),
    balances: { payer, seller, buyer, vault },
  };
  const end: unknown = await context.source.send("eth_getBlockByNumber", [
    toQuantity(blockNumber),
    false,
  ]);
  if (!end || typeof end !== "object" || !("hash" in end) || end.hash !== start.hash)
    throw new ConfigurationError("C5 snapshot block changed during reads");
  return {
    snapshot,
    blockHash: start.hash,
    timestamp: start.timestamp,
    blockNumber,
    claimRaw: claimRead?.raw ?? null,
    roundRaw,
    backingRaw: backing.raw,
    allowanceRaw: allowance.raw,
    balancesRaw: balances.map((balance) => balance.raw),
  };
}

export function sourceEvent(receipt: C5SourceReceipt, name: string) {
  const abi = contractInterfaces.vault;
  const matches = receipt.logs
    .map((log, index) => ({ log, index }))
    .filter(
      ({ log }) =>
        log.address.toLowerCase() === campaignContracts.vault.address.toLowerCase() &&
        log.topics[0] === abi.getEvent(name)?.topicHash,
    );
  const selected = matches[0];
  if (receipt.status !== 1 || !selected || matches.length !== 1)
    throw new ConfigurationError("Missing or ambiguous successful C5 source event");
  const decoded = abi.parseLog(selected.log);
  if (!decoded) throw new ConfigurationError("Invalid C5 source event");
  return { ...selected, decoded };
}

export function checkEvent(receipt: C5SourceReceipt, name: string, expected: readonly unknown[]) {
  const event = sourceEvent(receipt, name);
  if (
    event.decoded.args.length !== expected.length ||
    expected.some((value, index) => event.decoded.args[index] !== value)
  )
    throw new ConfigurationError("C5 source event differs from approval");
  return {
    receiptLocalLogIndex: event.index,
    sourceEvent: { address: event.log.address, topics: event.log.topics, data: event.log.data },
  };
}

export function creationClaimId(receipt: C5SourceReceipt): bigint {
  const claimId = decodedInteger(sourceEvent(receipt, "ClaimFunded").decoded.args[0]);
  if (claimId <= 0n) throw new ConfigurationError("C5 creation emitted invalid claim ID");
  const terms = c5Terms(claimId, 1n);
  checkEvent(receipt, "ClaimFunded", [
    claimId,
    campaignActors.PAYER,
    terms.seller,
    terms.sourceToken,
    terms.sourceFaceValueRaw,
    terms.maturity,
    ZeroHash,
  ]);
  return claimId;
}
