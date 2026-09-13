import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { interfaces } from "../src/checker-rpc.ts";
import { record, string } from "../src/evidence-files.ts";
import { blockAtOrBefore, proofCallMatches, requireProofCoverage } from "../src/proof-history.ts";
import { validateManifest } from "../src/manifest-validation.ts";

const original = record(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../evidence/campaign/a-reserve-1789253834769-719d6a4799d9d4effedb60239ecc69c8c8aa45ef284e6bd69b6011d90662ce48.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as unknown,
);
const funding = record(
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
const call = interfaces.market.parseTransaction({ data: string(funding.fundingCalldata) });
assert.ok(call);

await test("T59 historical proof use requires exact mined envelope and receipt-local log index", () => {
  assert.equal(proofCallMatches(original, call, 0), true);
  assert.equal(proofCallMatches(original, call, 1), false);
  assert.equal(proofCallMatches({ ...original, headerNumber: 1 }, call, 0), false);
  assert.equal(
    proofCallMatches(
      { ...original, continuityProof: { ...record(original.continuityProof), roots: [] } },
      call,
      0,
    ),
    false,
  );
});

await test("Historical observation reconstruction selects an actual prior block, not an invented height", async () => {
  const timestamp = (height: number) => Promise.resolve(height * 10);
  assert.equal(await blockAtOrBefore(100, 110, 1059, timestamp), 105);
  assert.equal(await blockAtOrBefore(100, 110, 1060, timestamp), 106);
  await assert.rejects(blockAtOrBefore(100, 110, 999, timestamp));
});

await test("T59 every mined funding needs its exact reservation proof, not outcome-labeled bytes", async () => {
  const manifest = validateManifest(
    JSON.parse(
      readFileSync(
        new URL("../../../evidence/manifests/a-1789257485967.json", import.meta.url),
        "utf8",
      ),
    ) as unknown,
  );
  const transaction = manifest.transactions.find((item) => item.action === "a-fund");
  assert.ok(transaction);
  const transactions = new Map([
    [transaction.transactionHash, { data: string(funding.fundingCalldata) }],
  ]);
  await requireProofCoverage(manifest, transactions);
  await assert.rejects(requireProofCoverage({ ...manifest, proofs: [] }, transactions));
  await assert.rejects(
    requireProofCoverage(
      {
        ...manifest,
        proofs: manifest.proofs.map((proof) => ({
          ...proof,
          decodedEvent: { ...proof.decodedEvent, name: "SaleAssigned" },
        })),
      },
      transactions,
    ),
  );
});
