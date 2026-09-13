import assert from "node:assert/strict";
import {
  Block,
  JsonRpcProvider,
  Network,
  TransactionReceipt,
  ZeroAddress,
  ZeroHash,
  keccak256,
  toBeHex,
} from "ethers";
import type { AddressLike, BlockTag, Interface, TransactionRequest } from "ethers";
import { campaignActors, campaignTerms } from "../src/campaign-config.ts";
import { saleIdentity } from "../src/canonical.ts";

export const terms = campaignTerms("a", 2n);
export const identity = saleIdentity(terms);
export const sourceHash = keccak256("0x10");
export const destinationHash = keccak256("0x20");
export const fundingBlockHash = keccak256("0x19");
export const fixtureTime = 1789255000n;

export type FundingPatch = Partial<
  Pick<TransactionReceipt, "status" | "from" | "to" | "blockNumber" | "blockHash">
> & {
  emitter?: string;
  saleId?: string;
  buyer?: string;
  amount?: bigint;
  duplicate?: boolean;
  missingEvent?: boolean;
  malformedEvent?: boolean;
};

type RuntimeContracts = Readonly<Record<string, { abi: Interface; code: string }>>;

export class PreflightRpcFixture extends JsonRpcProvider {
  readonly blocks: (BlockTag | undefined)[] = [];
  readonly reads: { address: string; blockTag: BlockTag | null | undefined; method: string }[] = [];
  readonly receiptHashes: string[] = [];
  funding: FundingPatch = {};
  missingReceipt = false;
  missingBlock = false;
  changedSnapshot: number | undefined;
  wrongRuntime: string | undefined;
  failure: "block" | "code" | "call" | "receipt" | undefined;
  chainId: bigint;
  private contracts: RuntimeContracts;

  constructor(chainId: bigint, contracts: RuntimeContracts) {
    super(undefined, undefined, { cacheTimeout: -1 });
    this.chainId = chainId;
    this.contracts = contracts;
  }

  override getNetwork(): Promise<Network> {
    return Promise.resolve(Network.from(this.chainId));
  }

  override send(
    method: string,
    params: readonly unknown[] | Record<string, unknown>,
  ): Promise<unknown> {
    assert.equal(method, "eth_chainId");
    assert.deepEqual(params, []);
    return Promise.resolve(toBeHex(this.chainId));
  }

  override getBlock(blockTag?: BlockTag): Promise<Block | null> {
    this.blocks.push(blockTag);
    if (this.failure === "block") return Promise.reject(new Error("fixture block RPC failure"));
    if (this.missingBlock) return Promise.resolve(null);
    const number = typeof blockTag === "number" ? blockTag : this.chainId === 11155111n ? 10 : 20;
    const hash = number === 10 ? sourceHash : number === 20 ? destinationHash : fundingBlockHash;
    return Promise.resolve(
      new Block(
        {
          number,
          hash: this.changedSnapshot === blockTag ? ZeroHash : hash,
          timestamp: Number(fixtureTime),
          parentHash: ZeroHash,
          nonce: "0x0000000000000000",
          difficulty: 0n,
          gasLimit: 30000000n,
          gasUsed: 0n,
          miner: ZeroAddress,
          extraData: "0x",
          baseFeePerGas: 1n,
          transactions: [],
        },
        this,
      ),
    );
  }

  override getCode(address: AddressLike, blockTag?: BlockTag): Promise<string> {
    assert(typeof address === "string");
    this.reads.push({ address, blockTag, method: "getCode" });
    if (this.failure === "code") return Promise.reject(new Error("fixture code RPC failure"));
    if (address === this.wrongRuntime) return Promise.resolve("0x00");
    return Promise.resolve(this.contract(address).code);
  }

  private contract(address: string) {
    const contract = this.contracts[address];
    assert(contract);
    return contract;
  }

  override call(transaction: TransactionRequest): Promise<string> {
    assert(typeof transaction.to === "string");
    assert.equal(typeof transaction.data, "string");
    const address = transaction.to;
    const abi = this.contract(address).abi;
    const decoded = abi.parseTransaction({ data: String(transaction.data) });
    assert(decoded);
    const method = decoded.name;
    this.reads.push({ address, blockTag: transaction.blockTag, method });
    if (this.failure === "call") return Promise.reject(new Error("fixture call RPC failure"));
    let result: readonly unknown[];
    if (method === "getClaim") {
      assert.equal(decoded.args[0], terms.claimId);
      result = [
        [
          terms.sourceToken,
          terms.sourceFaceValueRaw,
          terms.maturity,
          terms.seller,
          terms.seller,
          terms.round,
          terms.round,
          false,
          false,
          ZeroHash,
        ],
      ];
    } else if (method === "getRound") {
      assert.deepEqual(Array.from(decoded.args), [terms.claimId, terms.round]);
      result = [[terms, 1n, identity.saleId, identity.termsHash]];
    } else if (method === "getSale") {
      assert.equal(decoded.args[0], identity.saleId);
      result = [[terms, 1n]];
    } else if (method === "balanceOf") {
      assert.equal(
        decoded.args[0],
        address === terms.sourceToken ? terms.sourceVault : terms.destinationMarket,
      );
      result = [
        address === terms.sourceToken ? terms.sourceFaceValueRaw : terms.grossPurchasePriceRaw,
      ];
    } else {
      assert(["totalBacking", "totalBound", "totalCredits", "totalLiabilities"].includes(method));
      result = [
        method === "totalCredits"
          ? 0n
          : method === "totalBacking"
            ? terms.sourceFaceValueRaw
            : terms.grossPurchasePriceRaw,
      ];
    }
    return Promise.resolve(abi.encodeFunctionResult(method, result));
  }

  override getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
    this.receiptHashes.push(hash);
    if (this.failure === "receipt") return Promise.reject(new Error("fixture receipt RPC failure"));
    if (this.missingReceipt) return Promise.resolve(null);
    const patch = this.funding;
    const abi = this.contract(terms.destinationMarket).abi;
    const fragment = abi.getEvent("ReservationFunded");
    assert(fragment);
    const event = abi.encodeEventLog(fragment, [
      patch.saleId ?? identity.saleId,
      ZeroHash,
      patch.buyer ?? terms.buyer,
      patch.amount ?? terms.grossPurchasePriceRaw,
    ]);
    const log = {
      ...event,
      data: patch.malformedEvent ? "0x00" : event.data,
      address: patch.emitter ?? terms.destinationMarket,
      transactionHash: hash,
      blockHash: patch.blockHash ?? fundingBlockHash,
      blockNumber: patch.blockNumber ?? 19,
      transactionIndex: 0,
      index: 0,
      removed: false,
    };
    return Promise.resolve(
      new TransactionReceipt(
        {
          to: patch.to ?? terms.destinationMarket,
          from: patch.from ?? campaignActors.BUYER,
          contractAddress: null,
          hash,
          index: 0,
          blockHash: log.blockHash,
          blockNumber: log.blockNumber,
          logsBloom: "0x" + "00".repeat(256),
          logs: patch.missingEvent ? [] : patch.duplicate ? [log, { ...log, index: 1 }] : [log],
          gasUsed: 1n,
          cumulativeGasUsed: 1n,
          gasPrice: 1n,
          type: 2,
          status: patch.status ?? 1,
          root: null,
        },
        this,
      ),
    );
  }
}
