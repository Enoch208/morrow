import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  Block,
  Interface,
  JsonRpcProvider,
  Signature,
  TransactionReceipt,
  TransactionResponse,
  ZeroAddress,
  ZeroHash,
  keccak256,
  toBeHex,
  zeroPadValue,
} from "ethers";
import type { AddressLike, BlockTag } from "ethers";
import { checkedArtifact, record, string } from "../src/evidence-files.ts";
import { validateManifest } from "../src/manifest-validation.ts";
import type { DeploymentRole } from "../src/manifest-types.ts";

class DeploymentRpcFixture extends JsonRpcProvider {
  readonly checked: string[] = [];
  runtime = "0x";
  data = "0x";
  canonical = true;
  readonly archived: Record<string, unknown>;

  constructor(archived: Record<string, unknown>) {
    super(undefined, undefined, { cacheTimeout: -1 });
    this.archived = archived;
  }

  override send(): Promise<never> {
    return Promise.reject(new Error("Unexpected fixture network access"));
  }

  override getTransaction(hash: string): Promise<TransactionResponse> {
    assert.equal(hash, this.archived.hash);
    this.checked.push("transaction");
    return Promise.resolve(
      new TransactionResponse(
        {
          hash,
          to: null,
          from: string(this.archived.from),
          data: this.data,
          value: 0n,
          nonce: 0,
          gasLimit: BigInt(string(this.archived.gasUsed)),
          gasPrice: 1n,
          type: 0,
          chainId: 0n,
          signature: Signature.from({ r: ZeroHash, s: ZeroHash, v: 27 }),
          accessList: null,
          authorizationList: null,
          blockNumber: Number(this.archived.blockNumber),
          blockHash: string(this.archived.blockHash),
          index: Number(this.archived.index),
          maxFeePerGas: null,
          maxPriorityFeePerGas: null,
        },
        this,
      ),
    );
  }

  override getTransactionReceipt(hash: string): Promise<TransactionReceipt> {
    assert.equal(hash, this.archived.hash);
    this.checked.push("receipt");
    return Promise.resolve(
      new TransactionReceipt(
        {
          hash,
          to: null,
          from: string(this.archived.from),
          contractAddress: string(this.archived.contractAddress),
          blockNumber: Number(this.archived.blockNumber),
          blockHash: string(this.archived.blockHash),
          index: Number(this.archived.index),
          status: Number(this.archived.status),
          logs: [],
          logsBloom: string(this.archived.logsBloom),
          gasUsed: BigInt(string(this.archived.gasUsed)),
          cumulativeGasUsed: BigInt(string(this.archived.cumulativeGasUsed)),
          gasPrice: BigInt(string(this.archived.gasPrice)),
          type: 0,
          root: null,
        },
        this,
      ),
    );
  }

  override getCode(address: AddressLike): Promise<string> {
    assert.equal(address, this.archived.contractAddress);
    this.checked.push("runtime");
    return Promise.resolve(this.runtime);
  }

  override getBlock(blockTag?: BlockTag): Promise<Block> {
    assert.equal(blockTag, this.archived.blockNumber);
    this.checked.push("block");
    return Promise.resolve(
      new Block(
        {
          number: Number(this.archived.blockNumber),
          hash: this.canonical ? string(this.archived.blockHash) : ZeroHash,
          timestamp: 0,
          parentHash: ZeroHash,
          nonce: "0x0000000000000000",
          difficulty: 0n,
          gasLimit: 30000000n,
          gasUsed: 0n,
          miner: ZeroAddress,
          extraData: "0x",
          transactions: [],
          baseFeePerGas: null,
        },
        this,
      ),
    );
  }
}

export async function runtimeFixture(role: DeploymentRole) {
  const json = async (path: string) =>
    JSON.parse(await readFile(new URL(`../../../${path}`, import.meta.url), "utf8")) as unknown;
  const manifest = validateManifest(await json("evidence/manifests/gate-1789279209011.json"));
  const deployment = manifest.deployments.find((entry) => entry.role === role);
  assert.ok(deployment);
  const provenance = record(await json("deployments/custody/provenance-1789252172280.json"));
  assert.ok(Array.isArray(provenance.deployments));
  const archived = provenance.deployments
    .map(record)
    .find((entry) => entry.address === deployment.address);
  assert.ok(archived);
  const artifact = record(
    JSON.parse((await checkedArtifact(deployment.artifact)).toString("utf8")) as unknown,
  );
  const bytecode = string(record(artifact.bytecode).object);
  const runtime = record(artifact.deployedBytecode);
  const values =
    role === "market"
      ? deployment.constructorArguments
      : role === "vault"
        ? deployment.constructorArguments
        : [deployment.constructorArguments[2]];
  const rpc = new DeploymentRpcFixture(record(archived.receipt));
  rpc.data =
    bytecode +
    new Interface(JSON.stringify(artifact.abi))
      .encodeDeploy(deployment.constructorArguments)
      .slice(2);
  rpc.runtime = string(runtime.object);
  let immutableOffset = 0;
  Object.values(record(runtime.immutableReferences)).forEach((entries, index) => {
    assert.ok(Array.isArray(entries));
    const value = values[index];
    assert.ok(typeof value === "string" || typeof value === "number");
    const encoded = zeroPadValue(
      typeof value === "string" && value.startsWith("0x") ? value : toBeHex(BigInt(value)),
      32,
    ).slice(2);
    for (const entry of entries.map(record)) {
      assert.equal(entry.length, 32);
      const offset = 2 + Number(entry.start) * 2;
      immutableOffset ||= offset;
      rpc.runtime = rpc.runtime.slice(0, offset) + encoded + rpc.runtime.slice(offset + 64);
    }
  });
  assert.equal(keccak256(rpc.runtime), deployment.runtimeCodeHash);
  assert.equal(keccak256(bytecode), archived.creationBytecodeHash);
  const rows = (
    await readFile(new URL("../../../evidence/custody/actions.jsonl", import.meta.url), "utf8")
  )
    .trim()
    .split("\n")
    .map((line) => record(JSON.parse(line) as unknown));
  const mined = rows.find(
    (row) => row.transactionHash === deployment.transactionHash && row.state === "mined",
  );
  assert.ok(mined);
  assert.equal(keccak256(rpc.data), mined.calldataHash);
  return { deployment, rpc, immutableOffset, creationLength: bytecode.length };
}
