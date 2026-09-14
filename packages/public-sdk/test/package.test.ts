import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

void test("built JavaScript and declarations have no private workspace or source-file dependencies", async () => {
  for (const filename of ["index.js", "index.d.ts"]) {
    const contents = await readFile(new URL(`../dist/${filename}`, import.meta.url), "utf8");
    assert.ok(contents.length > 0);
    assert.doesNotMatch(contents, /@morrow\//);
    assert.doesNotMatch(contents, /node:fs|node:child_process|workspace:/);
    assert.doesNotMatch(contents, /(?:from|import)\s*["'][^"']*\.ts["']/);
  }
});

void test("package exports built files and whitelists only distributable assets", async () => {
  const value = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as {
    dependencies: Record<string, string>;
    files: string[];
    license: string;
    exports: Record<string, { types: string; import: string }>;
  };
  assert.deepEqual(Object.keys(value.dependencies), ["ethers"]);
  assert.deepEqual(value.files, ["dist", "LICENSE", "README.md", "example"]);
  assert.equal(value.license, "MIT");
  assert.equal(value.exports["."]?.import, "./dist/index.js");
  assert.equal(value.exports["."].types, "./dist/index.d.ts");
});
