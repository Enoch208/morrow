import assert from "node:assert/strict";
import test from "node:test";
import { readPublicArtifact } from "../src/evidence-files.ts";
import { validateManifest } from "../src/manifest-validation.ts";
import {
  requireReleaseSet,
  requireTerminalCampaign,
  assertReleaseTiming,
} from "../src/release-campaign-policy.ts";
import { releaseFailure, releaseVerificationAttempt } from "../src/release-verification-attempt.ts";
import { EvidenceError } from "../src/checker-rpc.ts";

const paths = [
  "evidence/manifests/gate-1789279209011.json",
  "evidence/manifests/a-1789279123015.json",
  "evidence/manifests/b-1789279177757.json",
] as const;
const manifests = await Promise.all(
  paths.map(async (path) =>
    validateManifest(JSON.parse((await readPublicArtifact(path)).toString("utf8")) as unknown),
  ),
);
const a = manifests[1];
assert.ok(a);

await test("EVD-001 release input cannot duplicate or substitute a canonical campaign", () => {
  assert.doesNotThrow(() => {
    requireReleaseSet(manifests);
  });
  assert.throws(() => {
    requireReleaseSet([a, a, a]);
  }, /distinct/);
  assert.throws(() => {
    requireReleaseSet(manifests.slice(0, 2));
  }, /three/);
  assert.throws(() => {
    requireReleaseSet(
      manifests.map((manifest) =>
        manifest.campaignId === "a"
          ? { ...manifest, terms: { ...manifest.terms, claimId: "4" } }
          : manifest,
      ),
    );
  }, /canonical/);
  assert.throws(() => {
    requireReleaseSet(
      manifests.map((manifest) =>
        manifest.campaignId === "a"
          ? { ...manifest, identity: { ...manifest.identity, saleId: "0x" + "11".repeat(32) } }
          : manifest,
      ),
    );
  }, /canonical/);
});

await test("EVD-003 terminal checks require actual seller, fee and buyer withdrawals", () => {
  for (const manifest of manifests) {
    assert.doesNotThrow(() => {
      requireTerminalCampaign(manifest);
    });
    const terminal =
      manifest.campaignId === "a" ? "withdraw-fee" : `${manifest.campaignId}-withdraw`;
    assert.throws(() => {
      requireTerminalCampaign({
        ...manifest,
        transactions: manifest.transactions.filter((item) => item.action !== terminal),
      });
    }, /successful/);
    assert.throws(() => {
      requireTerminalCampaign({
        ...manifest,
        actualOutcome: { ...manifest.actualOutcome, redeemed: false },
      });
    }, /terminal/);
  }
});

await test("EVD-002A measured block chronology must actually demonstrate late A settlement", () => {
  const times = {
    "a-create": 1789250000,
    "a-reserve": 1789250100,
    "a-fund": 1789250200,
    "a-assign": 1789261199,
    "a-redeem": 1789272000,
    "a-settle": 1789272001,
    "a-withdraw": 1789272002,
    "withdraw-fee": 1789272003,
  };
  assert.doesNotThrow(() => {
    assertReleaseTiming(a, times);
  });
  assert.throws(() => {
    assertReleaseTiming(a, { ...times, "a-assign": 1789261200 });
  }, /assignment/);
  assert.throws(() => {
    assertReleaseTiming(a, { ...times, "a-settle": 1789271999 });
  }, /late/);
  assert.throws(() => {
    assertReleaseTiming(a, { ...times, "a-redeem": 1789272010 });
  }, /late/);
  assert.throws(() => {
    assertReleaseTiming(a, { ...times, "a-withdraw": 1789271999 });
  }, /withdrawal/);
});

await test("EVD-003 retries only identified transport errors and preserves failed attempts", async () => {
  let tries = 0;
  const recovered = await releaseVerificationAttempt(() => {
    tries++;
    return tries === 1
      ? Promise.reject(Object.assign(new Error("untrusted endpoint details"), { code: "TIMEOUT" }))
      : Promise.resolve("raw checked result");
  });
  assert.equal(recovered.status, "verified");
  assert.equal(recovered.attempts, 2);
  assert.deepEqual(recovered.failures, [{ attempt: 1, kind: "transport", detail: "TIMEOUT" }]);
  const invalid = await releaseVerificationAttempt(() =>
    Promise.reject(new EvidenceError("canonical sale mismatch")),
  );
  assert.equal(invalid.status, "unverifiable");
  assert.equal(invalid.result, null);
  assert.equal(invalid.attempts, 1);
  assert.equal(invalid.failures[0]?.kind, "data");
  assert.equal(
    releaseFailure(Object.assign(new Error("secret-bearing path"), { code: "ENOENT" }), 1).detail,
    "ENOENT",
  );
});
