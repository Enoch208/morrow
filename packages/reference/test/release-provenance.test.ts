import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { verifyReleaseProvenanceAt } from "../src/release-provenance.ts";
import {
  compareCompilerArtifact,
  custodyContracts,
  custodyProvenancePath,
} from "../src/release-provenance-artifacts.ts";
import { git, record, string } from "../src/release-provenance-files.ts";
import { verifyCompilerSettings } from "../src/release-provenance-metadata.ts";
import { provenanceFixture, sourceRoot } from "./release-provenance-fixture.ts";

await test("EVD-003 explicit commit matches real pinned compiler artifacts, ABI, settings and source hashes", async () => {
  const { root, commit, save } = await provenanceFixture();
  try {
    const result = await verifyReleaseProvenanceAt(root, commit);
    assert.equal(result.status, "PASS", JSON.stringify(result.issues));
    assert.equal(result.implementationCommit, commit);
    assert.deepEqual(
      result.artifacts.map((entry) => entry.contractName),
      [...custodyContracts],
    );
    assert.ok(result.files.length > 30);
    assert.ok(result.artifacts.every((entry) => entry.sources.length > 5));
    assert.ok(
      result.artifacts.some((entry) =>
        entry.sources.some((source) => source.lineEndingsNormalized),
      ),
    );
    const sourcePath = "contracts/src/source/FundedPaymentVault.sol";
    const original = await readFile(join(root, sourcePath));
    await save(sourcePath, Buffer.concat([original, Buffer.from("\n")]));
    const stale = await verifyReleaseProvenanceAt(root, commit);
    assert.equal(stale.status, "FAIL");
    assert.ok(
      stale.issues.some(
        (issue) => issue.path === sourcePath && issue.code === "candidate-file-mismatch",
      ),
    );
    assert.ok(stale.issues.some((issue) => issue.message.includes("Stale compiler output")));
    await save(sourcePath, original);
    const dependency =
      "packages/sdk/node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol";
    const vendor = await readFile(join(root, dependency));
    await save(dependency, Buffer.concat([vendor, Buffer.from("\n")]));
    const changedVendor = await verifyReleaseProvenanceAt(root, commit);
    assert.equal(changedVendor.status, "FAIL");
    assert.ok(changedVendor.issues.some((issue) => issue.message.includes(dependency)));
  } finally {
    await rm(root, { recursive: true });
  }
});

await test("EVD-004 changed lock/config/schema or pinned deployment artifact cannot match candidate", async () => {
  const { root, commit, save } = await provenanceFixture();
  try {
    const provenance = record(
      JSON.parse(await readFile(join(root, custodyProvenancePath), "utf8")) as unknown,
    );
    assert.ok(Array.isArray(provenance.deployments));
    const artifactPath = string(record(provenance.deployments[0]).artifactPath);
    for (const path of [
      "pnpm-lock.yaml",
      "contracts/foundry.toml",
      "schemas/abi/FundedPaymentVault.json",
      artifactPath,
    ]) {
      const bytes = await readFile(join(root, path));
      await save(path, Buffer.concat([bytes, Buffer.from("\n")]));
      const result = await verifyReleaseProvenanceAt(root, commit);
      assert.equal(result.status, "FAIL");
      assert.ok(
        result.issues.some(
          (issue) => issue.path === path && issue.code === "candidate-file-mismatch",
        ),
      );
      await save(path, bytes);
    }
    await save("schemas/uncommitted-release.json", "{}\n");
    const uncommitted = await verifyReleaseProvenanceAt(root, commit);
    assert.equal(uncommitted.status, "FAIL");
    assert.ok(
      uncommitted.files.some(
        (file) => file.path === "schemas/uncommitted-release.json" && file.expectedBlob === null,
      ),
    );
  } finally {
    await rm(root, { recursive: true });
  }
});

await test("EVD-003 compiler output mutations cannot hide behind unchanged production source", async () => {
  const { root, commit, save } = await provenanceFixture();
  try {
    const path = "contracts/out/MorrowMarket.sol/MorrowMarket.json";
    const original = record(JSON.parse(await readFile(join(root, path), "utf8")) as unknown);
    for (const field of [
      "bytecode",
      "deployedBytecode",
      "abi",
      "metadata",
      "rawMetadata",
      "methodIdentifiers",
    ]) {
      const modified = structuredClone(original);
      if (field === "bytecode" || field === "deployedBytecode")
        record(modified[field]).object = "0x00";
      else modified[field] = field === "rawMetadata" ? "{}" : field === "abi" ? [] : {};
      assert.throws(() => {
        compareCompilerArtifact(original, modified);
      });
      await save(path, JSON.stringify(modified));
      const report = await verifyReleaseProvenanceAt(root, commit);
      assert.equal(report.status, "FAIL");
      assert.ok(report.issues.some((issue) => issue.path === path));
    }
    const config = await readFile(join(root, "contracts/foundry.toml"), "utf8");
    assert.throws(() => {
      verifyCompilerSettings(
        record(original.metadata),
        config.replace('solc_version = "0.8.28"', 'solc_version = "0.8.29"'),
      );
    }, /version/);
    assert.throws(() => {
      verifyCompilerSettings(
        record(original.metadata),
        config.replace("optimizer_runs = 200", "optimizer_runs = 201"),
      );
    }, /optimizer/);
  } finally {
    await rm(root, { recursive: true });
  }
});

await test("EVD-004 release identity cannot be a branch, short hash, absent commit or other Git object", async () => {
  for (const commit of ["HEAD", "99d5d8d", "0".repeat(40), "../HEAD", "--help"])
    await assert.rejects(verifyReleaseProvenanceAt(sourceRoot, commit));
  const tree = (await git(sourceRoot, ["rev-parse", "HEAD^{tree}"])).trim();
  await assert.rejects(verifyReleaseProvenanceAt(sourceRoot, tree), /not a Git commit/);
});
