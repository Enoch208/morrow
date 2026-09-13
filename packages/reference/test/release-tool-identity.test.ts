import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { releaseToolIdentity, assertReleaseToolUnchanged } from "../src/release-tool-identity.ts";

await test("release checker identifies actual source bytes separately from candidate application commit", async () => {
  const identity = await releaseToolIdentity();
  assert.match(identity.head, /^[0-9a-f]{40}$/);
  const entry = identity.files.find(
    (file) => file.path === "packages/reference/src/release-tool-identity.ts",
  );
  assert.ok(entry);
  const bytes = await readFile(new URL("../src/release-tool-identity.ts", import.meta.url));
  assert.equal(entry.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(
    identity.matchesHead,
    identity.files.every((file) => file.matchesHead),
  );
  assertReleaseToolUnchanged(identity, structuredClone(identity));
  assert.throws(() => {
    assertReleaseToolUnchanged(identity, { ...identity, files: identity.files.slice(1) });
  }, /changed/);
  assert.throws(() => {
    assertReleaseToolUnchanged(identity, { ...identity, head: "0".repeat(40) });
  }, /changed/);
});
