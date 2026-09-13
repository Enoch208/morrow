import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateManifest } from "../src/manifest-validation.ts";
import { checkManifestState } from "../src/manifest-state-check.ts";
import { checkTransactionAction } from "../src/manifest-transactions.ts";
import { record, string } from "../src/evidence-files.ts";
import { manifestSchema } from "../src/manifest-schema.ts";
import { applicationInterfaces } from "../src/manifest-chain.ts";
import { expectedPayment } from "../src/transaction-payments.ts";

const value: unknown = JSON.parse(
  readFileSync(
    new URL("../../../evidence/manifests/a-1789257485967.json", import.meta.url),
    "utf8",
  ),
);
const manifest = validateManifest(value);

await test("EVD-001 real A manifest validates without asserting settlement or redemption", () => {
  checkManifestState(manifest);
  assert.deepEqual(manifest.actualOutcome, {
    sourceRoundState: 2,
    destinationState: 1,
    redeemed: false,
  });
  assert.equal(manifest.implementationCommit, null);
  assert.ok(manifest.commitBlocker);
  assert.deepEqual(
    JSON.parse(
      readFileSync(new URL("../../../schemas/campaign-v1.schema.json", import.meta.url), "utf8"),
    ) as unknown,
    manifestSchema,
  );
});

await test("T59 schema rejects unknown fields, wrong token units and omitted blockers", () => {
  assert.throws(() => validateManifest({ ...manifest, privateKey: "not-a-key" }));
  assert.throws(() =>
    validateManifest({
      ...manifest,
      tokens: manifest.tokens.map((token) => ({ ...token, decimals: 18 })),
    }),
  );
  assert.throws(() => validateManifest({ ...manifest, commitBlocker: null }));
});

await test("T59 canonical hash, round and native coordinate tampering is detected", () => {
  assert.throws(() =>
    validateManifest({
      ...manifest,
      identity: { ...manifest.identity, termsHash: manifest.identity.saleId },
    }),
  );
  assert.throws(() => validateManifest({ ...manifest, terms: { ...manifest.terms, round: "2" } }));
  assert.throws(() =>
    validateManifest({
      ...manifest,
      proofs: manifest.proofs.map((proof) => ({ ...proof, nativeTransactionIndex: "99999" })),
    }),
  );
});

await test("T59 a funding receipt cannot be relabeled as an actual withdrawal", () => {
  const funding = manifest.transactions.find((transaction) => transaction.action === "a-fund");
  assert.ok(funding);
  const report = record(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../evidence/independent/funding-85dbf790f02a40e1b03a39a43c3345fb5e34c1674141b4680d457c24fb6b719f-1789253879121.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as unknown,
  );
  const receipt = record(report.fundingReceipt);
  const response = {
    to: string(receipt.to),
    from: string(receipt.from),
    data: string(report.fundingCalldata),
    value: 0n,
  };
  assert.doesNotThrow(() => {
    checkTransactionAction(funding, response, manifest);
  });
  assert.throws(() => {
    checkTransactionAction({ ...funding, action: "a-withdraw" }, response, manifest);
  });
  assert.throws(() => validateManifest({ ...manifest, withdrawals: [funding] }));
});

await test("T59 false redemption and uncovered balance snapshots are rejected", () => {
  assert.throws(() => {
    checkManifestState({
      ...manifest,
      actualOutcome: { ...manifest.actualOutcome, redeemed: true },
    });
  });
  const snapshots = manifest.snapshots.map((snapshot) => ({
    ...snapshot,
    reads: snapshot.reads.map((read) =>
      read.role === "settlementToken" && read.method === "balanceOf"
        ? { ...read, raw: "0x" + "00".repeat(32) }
        : read,
    ),
  }));
  assert.throws(() => {
    checkManifestState({ ...manifest, snapshots });
  });
});

await test("T59 evidence references cannot substitute a secret path or duplicate a domain", () => {
  assert.throws(() =>
    validateManifest({ ...manifest, timeline: { ...manifest.timeline, path: ".env" } }),
  );
  const first = manifest.deployments[0];
  assert.ok(first);
  assert.throws(() => validateManifest({ ...manifest, deployments: [first, first, first, first] }));
});

await test("T59 shared approvals cannot authorize another actor or spender", () => {
  const item = manifest.transactions.find((entry) => entry.action === "approve-source");
  assert.ok(item);
  const transaction = {
    to: string(manifest.terms.sourceToken),
    from: string(manifest.terms.feeRecipient),
    data: applicationInterfaces.sourceToken.encodeFunctionData("approve", [
      manifest.terms.sourceVault,
      20010000000n,
    ]),
    value: 0n,
  };
  assert.doesNotThrow(() => {
    checkTransactionAction(item, transaction, manifest);
  });
  assert.throws(() => {
    checkTransactionAction(item, { ...transaction, from: string(manifest.terms.buyer) }, manifest);
  });
  assert.throws(() => {
    checkTransactionAction(
      item,
      {
        ...transaction,
        data: applicationInterfaces.sourceToken.encodeFunctionData("approve", [
          manifest.terms.buyer,
          20010000000n,
        ]),
      },
      manifest,
    );
  });
});

await test("T59 payment oracle distinguishes gross, seller net, fee and face in raw units", () => {
  const item = manifest.transactions.find((entry) => entry.action === "a-fund");
  assert.ok(item);
  const sender = { from: string(manifest.terms.seller), data: "0x" };
  assert.equal(expectedPayment(item, sender, manifest)?.amount, 9410000000n);
  assert.equal(
    expectedPayment({ ...item, action: "a-withdraw" }, sender, manifest)?.amount,
    9362950000n,
  );
  assert.equal(
    expectedPayment({ ...item, action: "a-withdraw-fee" }, sender, manifest)?.amount,
    47050000n,
  );
  assert.equal(
    expectedPayment({ ...item, action: "a-redeem" }, sender, manifest)?.amount,
    10000000000n,
  );
  assert.equal(expectedPayment({ ...item, receiptStatus: 0 }, sender, manifest), null);
  assert.equal(expectedPayment({ ...item, action: "a-settle" }, sender, manifest), null);
});
