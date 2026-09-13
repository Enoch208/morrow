import { AbiCoder, Result, isHexString, keccak256 } from "ethers";
import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import type { ProofEnvelope, SaleTerms } from "@morrow/protocol";
import { campaignContracts } from "./campaign-config.ts";
import { contractInterfaces, verifyCampaignContract } from "./contract-reads.ts";
import { encodeTerms, saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";
import { verifyNativeProof } from "./proof.ts";

export type C5ProofEvent = "reserve" | "assign" | "cancel";
const coder = AbiCoder.defaultAbiCoder();
const receiptTypes = ["uint8", "uint64", "tuple(address,bytes32[],bytes)[]", "bytes"];
const commonTypes = ["uint64", "uint64", "address", "bool", "address", "uint256", "bytes"];

function tuple(value: unknown): Result {
  if (!(value instanceof Result)) throw new ConfigurationError("Malformed authenticated tuple");
  return value;
}

function bytes(value: unknown): string {
  if (typeof value !== "string" || !isHexString(value))
    throw new ConfigurationError("Malformed authenticated bytes");
  return value.toLowerCase();
}

export async function canonicalC5Receipt(source: JsonRpcProvider, hash: string) {
  if (!isHexString(hash, 32)) throw new ConfigurationError("Invalid C5 source transaction hash");
  const receipt = await source.getTransactionReceipt(hash);
  if (receipt?.status !== 1 || receipt.to !== campaignContracts.vault.address)
    throw new ConfigurationError("C5 source transaction lacks successful vault receipt");
  await verifyCampaignContract(source, "vault", receipt.blockNumber);
  const block = await source.getBlock(receipt.blockNumber);
  if (
    !block?.hash ||
    block.hash !== receipt.blockHash ||
    block.transactions[receipt.index]?.toLowerCase() !== hash.toLowerCase() ||
    receipt.hash.toLowerCase() !== hash.toLowerCase() ||
    receipt.logs.some((log) => log.removed)
  )
    throw new ConfigurationError("C5 source receipt is not canonical");
  return receipt;
}

export function validateC5Proof(
  proof: ProofEnvelope,
  receipt: TransactionReceipt,
  terms: SaleTerms,
  event: C5ProofEvent,
  provenTxIndex: bigint,
) {
  if (
    proof.chainKey !== 1n ||
    proof.blockHeight !== BigInt(receipt.blockNumber) ||
    provenTxIndex !== BigInt(receipt.index) ||
    provenTxIndex < 0n ||
    terms.sourceEvmChainId !== 11155111n ||
    terms.sourceVault !== campaignContracts.vault.address
  )
    throw new ConfigurationError("C5 authenticated source coordinates mismatch");
  const identity = saleIdentity(terms);
  const transaction = coder.decode(["uint8", "bytes[]"], proof.encodedTransaction);
  const txType: unknown = transaction[0];
  if (typeof txType !== "bigint" || txType > 4n || txType !== BigInt(receipt.type))
    throw new ConfigurationError("C5 authenticated transaction type mismatch");
  const chunks = tuple(transaction[1]);
  if (chunks.length !== (txType <= 2n ? 3 : 4))
    throw new ConfigurationError("C5 authenticated transaction chunk count mismatch");
  const common = coder.decode(commonTypes, bytes(chunks[0]));
  const method =
    event === "reserve" ? "reserveSale" : event === "assign" ? "assignSale" : "cancelExpiredSale";
  const args =
    event === "reserve"
      ? [terms.claimId, terms]
      : event === "assign"
        ? [terms.claimId, terms.round, identity.termsHash]
        : [terms.claimId, terms.round];
  if (
    common[2] !== receipt.from ||
    common[3] !== false ||
    common[4] !== terms.sourceVault ||
    receipt.to !== terms.sourceVault ||
    common[5] !== 0n ||
    bytes(common[6]) !== contractInterfaces.vault.encodeFunctionData(method, args).toLowerCase() ||
    (event !== "cancel" && common[2] !== terms.seller)
  )
    throw new ConfigurationError("C5 authenticated source call mismatch");
  const decoded = coder.decode(receiptTypes, bytes(chunks[chunks.length - 1]));
  if (
    decoded[0] !== 1n ||
    receipt.status !== 1 ||
    decoded[1] !== receipt.gasUsed ||
    bytes(decoded[3]) !== receipt.logsBloom.toLowerCase()
  )
    throw new ConfigurationError("C5 authenticated receipt fields mismatch");
  const logs = tuple(decoded[2]);
  if (logs.length !== receipt.logs.length)
    throw new ConfigurationError("C5 authenticated receipt log count mismatch");
  for (let index = 0; index < logs.length; index++) {
    const log = tuple(logs[index]);
    const actual = receipt.logs[index];
    if (
      !actual ||
      actual.removed ||
      bytes(log[0]) !== actual.address.toLowerCase() ||
      bytes(log[2]) !== actual.data.toLowerCase() ||
      JSON.stringify(tuple(log[1]).toArray().map(bytes)) !==
        JSON.stringify(actual.topics.map((topic) => topic.toLowerCase()))
    )
      throw new ConfigurationError("C5 authenticated log differs from source receipt");
  }
  const name =
    event === "reserve" ? "SaleReserved" : event === "assign" ? "SaleAssigned" : "SaleCancelled";
  const fragment = contractInterfaces.vault.getEvent(name);
  if (!fragment) throw new ConfigurationError("Missing C5 event ABI");
  const expected = contractInterfaces.vault.encodeEventLog(
    fragment,
    event === "reserve"
      ? [identity.saleId, terms.claimId, terms.round, identity.termsHash, encodeTerms(terms)]
      : [identity.saleId, terms.claimId, terms.round, identity.termsHash],
  );
  const candidates = receipt.logs
    .map((log, index) => ({ log, index }))
    .filter(({ log }) => log.address === terms.sourceVault && log.topics[0] === fragment.topicHash);
  const selected = candidates[0];
  if (
    candidates.length !== 1 ||
    selected?.log.data !== expected.data ||
    JSON.stringify(selected.log.topics) !== JSON.stringify(expected.topics)
  )
    throw new ConfigurationError("C5 authenticated event identity or canonical terms mismatch");
  const eventKey = keccak256(
    coder.encode(
      ["uint64", "uint64", "uint64", "uint256"],
      [proof.chainKey, proof.blockHeight, provenTxIndex, selected.index],
    ),
  );
  return { identity, eventKey, logIndex: selected.index };
}

export async function verifyC5Envelope(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  proof: ProofEnvelope,
  receipt: TransactionReceipt,
  terms: SaleTerms,
  event: C5ProofEvent,
) {
  const block = await destination.getBlock("finalized");
  if (!block?.hash)
    throw new ConfigurationError("C5 finalized native verification block unavailable");
  await verifyCampaignContract(destination, "market", block.number);
  const verified = await verifyNativeProof(destination, proof, block.number);
  if ((await destination.getBlock(block.number))?.hash !== block.hash)
    throw new ConfigurationError("C5 native verification block is not canonical");
  const sourceReceipt = await canonicalC5Receipt(source, receipt.hash);
  if (sourceReceipt.blockHash !== receipt.blockHash)
    throw new ConfigurationError("C5 source block changed during native verification");
  const binding = validateC5Proof(proof, sourceReceipt, terms, event, verified.provenTxIndex);
  return {
    ...binding,
    sourceReceipt,
    native: {
      ...verified,
      blockNumber: block.number,
      blockHash: block.hash,
      blockTimestamp: block.timestamp,
    },
  };
}
