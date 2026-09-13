import assert from "node:assert/strict";
import test from "node:test";
import { referenceIdentity } from "../src/index.ts";
import { validateManifest } from "../src/manifest-validation.ts";
import {
  assertPublicEvidence,
  safeArtifactPath,
  verifyArtifactBytes,
} from "../src/evidence-files.ts";
import { canonicalJson } from "../src/canonical-json.ts";

await test("EVD-001 incomplete evidence never validates as a campaign manifest", () => {
  assert.throws(() => validateManifest({ schemaVersion: 1, evidenceKind: "live-testnet-mined" }));
});

await test("T59 evidence paths cannot read secrets, leave the repository or disguise traversal", () => {
  for (const path of [
    ".env",
    "../.env",
    "/tmp/proof.json",
    "evidence/../../.env",
    "evidence/%2e%2e/.env",
    "docs/internal/key.json",
  ])
    assert.throws(() => safeArtifactPath(path));
  assert.equal(safeArtifactPath("evidence/blobs/abc.json"), "evidence/blobs/abc.json");
});

await test("T59 content-addressed evidence refuses altered proof bytes", () => {
  const digest = "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";
  assert.doesNotThrow(() => {
    verifyArtifactBytes(Buffer.from("{}"), digest);
  });
  assert.throws(() => {
    verifyArtifactBytes(Buffer.from('{"altered":true}'), digest);
  });
});

await test("independent identity cannot be replaced by a caller's hash", () => {
  assert.throws(() => referenceIdentity({ claimId: "1" }));
});

await test("receipt comparison uses serialized log data while retaining every published field", () => {
  const log = { provider: { runtimeOnly: true }, toJSON: () => ({ index: 3, data: "0x1234" }) };
  const archived = { logs: [{ data: "0x1234", index: 3 }], status: 1 };
  assert.equal(canonicalJson({ status: 1, logs: [log] }), canonicalJson(archived));
  assert.notEqual(canonicalJson({ ...archived, status: 0 }), canonicalJson(archived));
});

await test("public evidence rejects nested secret-bearing fields before writing files", () => {
  assert.throws(() => {
    assertPublicEvidence({ nested: [{ PAYER_PRIVATE_KEY: "must-not-persist" }] });
  });
  assert.doesNotThrow(() => {
    assertPublicEvidence({ token: "public-token-address", nativeVerification: true });
  });
});
