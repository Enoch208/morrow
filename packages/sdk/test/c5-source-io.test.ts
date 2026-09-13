import assert from "node:assert/strict";
import test from "node:test";
import { ZeroAddress, ZeroHash } from "ethers";
import type { TransactionRequest } from "ethers";
import { saleTermsFields } from "@morrow/protocol";
import { campaignActors, campaignContracts } from "../src/campaign-config.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import { c5Terms } from "../src/c5-config.ts";
import { creationClaimId, sourceSnapshot, checkEvent } from "../src/c5-source-io.ts";
import { assertC5SourceWindow, checkC5SourceEligibility } from "../src/c5-source-checks.ts";
import { PreflightRpcFixture, fundingBlockHash as headerHash } from "./preflight-rpc-fixture.ts";

const terms = c5Terms(101n, 1n);
const creation = [
  terms.claimId,
  campaignActors.PAYER,
  terms.seller,
  terms.sourceToken,
  terms.sourceFaceValueRaw,
  terms.maturity,
  ZeroHash,
];
function log(name: string, args: readonly unknown[]) {
  const event = contractInterfaces.vault.getEvent(name);
  assert(event);
  return { address: terms.sourceVault, ...contractInterfaces.vault.encodeEventLog(event, args) };
}

class SourceRpc extends PreflightRpcFixture {
  changed = false;
  failed = false;
  corruptAbsent = false;
  trailingBytes = false;
  allowance = terms.sourceFaceValueRaw;
  payer = 50000000n;
  readonly readBlocks: unknown[] = [];
  readonly methods: string[] = [];
  constructor() {
    super(11155111n, {});
  }
  override send(
    method: string,
    params: readonly unknown[] | Record<string, unknown>,
  ): Promise<unknown> {
    assert.equal(method, "eth_getBlockByNumber");
    assert.deepEqual(params, ["0x7b", false]);
    return Promise.resolve({ hash: this.changed ? ZeroHash : headerHash });
  }
  override call(transaction: TransactionRequest): Promise<string> {
    this.readBlocks.push(transaction.blockTag);
    if (this.failed) return Promise.reject(new Error("source RPC unavailable"));
    assert(typeof transaction.data === "string");
    const token = transaction.to === campaignContracts.sourceToken.address;
    const abi = token ? contractInterfaces.sourceToken : contractInterfaces.vault;
    const decoded = abi.parseTransaction({ data: transaction.data });
    assert(decoded);
    this.methods.push(decoded.name);
    let result: readonly unknown[];
    if (decoded.name === "getClaim") {
      assert.equal(decoded.args[0], 101n);
      result = [
        [
          terms.sourceToken,
          terms.sourceFaceValueRaw,
          terms.maturity,
          terms.seller,
          terms.seller,
          0n,
          0n,
          false,
          false,
          ZeroHash,
        ],
      ];
    } else if (decoded.name === "getRound") {
      assert.equal(decoded.args[0], 101n);
      assert(decoded.args[1] === 1n || decoded.args[1] === 2n);
      result = [
        [
          this.corruptAbsent
            ? terms
            : saleTermsFields.map((field) => (field.type === "address" ? ZeroAddress : 0n)),
          0n,
          ZeroHash,
          ZeroHash,
        ],
      ];
    } else if (decoded.name === "allowance") {
      assert.deepEqual(Array.from(decoded.args), [campaignActors.PAYER, terms.sourceVault]);
      result = [this.allowance];
    } else if (decoded.name === "balanceOf") {
      result = [
        decoded.args[0] === campaignActors.PAYER
          ? this.payer
          : decoded.args[0] === terms.sourceVault
            ? 10000000n
            : 0n,
      ];
    } else {
      assert.equal(decoded.name, "totalBacking");
      result = [10000000n];
    }
    return Promise.resolve(
      abi.encodeFunctionResult(decoded.name, result) + (this.trailingBytes ? "00".repeat(32) : ""),
    );
  }
}

await test("C5 derives actual claim ID from exact approved creation with decoy log", () => {
  const actual = log("ClaimFunded", creation);
  const decoy = { ...actual, address: ZeroAddress };
  assert.equal(creationClaimId({ status: 1, logs: [decoy, actual] }), 101n);
  assert.equal(
    checkEvent({ status: 1, logs: [decoy, actual] }, "ClaimFunded", creation).receiptLocalLogIndex,
    1,
  );
  for (const receipt of [
    { status: 0, logs: [actual] },
    { status: 1, logs: [decoy] },
    { status: 1, logs: [actual, actual] },
    { status: 1, logs: [{ ...actual, data: "0x00" }] },
  ])
    assert.throws(() => {
      creationClaimId(receipt);
    });
  for (const [index, replacement] of [
    [0, 0n],
    [1, terms.buyer],
    [2, terms.buyer],
    [3, ZeroAddress],
    [4, 1n],
    [5, terms.maturity + 1n],
    [6, headerHash],
  ] as const) {
    const changed = [...creation];
    changed[index] = replacement;
    assert.throws(() => {
      creationClaimId({ status: 1, logs: [log("ClaimFunded", changed)] });
    });
  }
});

await test("C5 source snapshot pins every read and rechecks uncached canonical header", async (t) => {
  const source = new SourceRpc();
  t.after(() => {
    source.destroy();
  });
  const context = { source, destination: source };
  const read = await sourceSnapshot(context, 123, 101n);
  assert.equal(read.blockHash, headerHash);
  assert.equal(read.snapshot.claim?.claimId, 101n);
  assert.equal(read.snapshot.allowance, 10000000n);
  assert.deepEqual(read.snapshot.rounds, [null, null]);
  assert.equal(read.snapshot.backing, 10000000n);
  assert(source.readBlocks.length > 0 && source.readBlocks.every((block) => block === 123));
  assert(!source.methods.includes("nextClaimId"));
  source.changed = true;
  await assert.rejects(sourceSnapshot(context, 123, 101n), /block changed/);
  source.changed = false;
  source.corruptAbsent = true;
  await assert.rejects(sourceSnapshot(context, 123, 101n), /Nonempty absent/);
  source.corruptAbsent = false;
  source.trailingBytes = true;
  await assert.rejects(sourceSnapshot(context, 123, 101n), /Noncanonical/);
  source.trailingBytes = false;
  source.failed = true;
  await assert.rejects(sourceSnapshot(context, 123, 101n), /source RPC unavailable/);
});

await test("C5 creation reread rejects nonexact allowance, missing funds and clock skew", async (t) => {
  const source = new SourceRpc();
  t.after(() => {
    source.destroy();
  });
  const context = { source, destination: source };
  const good = await sourceSnapshot(context, 123, null);
  checkC5SourceEligibility("create", c5Terms(0n, 1n), good.snapshot);
  for (const amount of [0n, 9999999n, 10000001n]) {
    source.allowance = amount;
    const current = await sourceSnapshot(context, 123, null);
    assert.throws(() => {
      checkC5SourceEligibility("create", c5Terms(0n, 1n), current.snapshot);
    });
  }
  source.allowance = 10000000n;
  source.payer = 9999999n;
  const unfunded = await sourceSnapshot(context, 123, null);
  assert.throws(() => {
    checkC5SourceEligibility("create", c5Terms(0n, 1n), unfunded.snapshot);
  });
  for (const delta of [-121n, 31n]) {
    assert.throws(() => {
      assertC5SourceWindow("create", 1789289000n + delta, 1789289000n, terms);
    });
  }
});
