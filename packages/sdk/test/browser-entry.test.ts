import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

function runtimeImports(path: string): readonly string[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest);
  const imports: string[] = [];
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword
    ) {
      assert.ok(ts.isStringLiteral(statement.moduleSpecifier));
      imports.push(statement.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      assert.ok(ts.isStringLiteral(statement.moduleSpecifier));
      imports.push(statement.moduleSpecifier.text);
    }
  }
  return imports;
}

await test("browser entry exposes preparation without Node or wallet-key modules", async () => {
  const entry = import.meta.resolve("@morrow/sdk/browser");
  const pending = [entry];
  const visited = new Set<string>();
  while (pending.length) {
    const url = pending.pop();
    assert.ok(url);
    if (visited.has(url) || url.endsWith(".json")) continue;
    visited.add(url);
    assert.doesNotMatch(url, /\/(environment|artifact|campaign-chain|campaign-log)\.ts$/);
    for (const dependency of runtimeImports(fileURLToPath(url))) {
      assert.ok(!dependency.startsWith("node:"), dependency);
      if (dependency.startsWith(".")) pending.push(new URL(dependency, url).href);
      else if (dependency === "@morrow/protocol") pending.push(import.meta.resolve(dependency));
      else
        assert.ok(
          [
            "ethers",
            "@gluwa/usc-sdk/dist/block-prover/block_prover.json",
            "@gluwa/usc-sdk/dist/chain-info/chain_info.json",
            "@gluwa/usc-sdk/dist/proof-provider/service/index.js",
          ].includes(dependency),
          dependency,
        );
    }
  }
  const browser: unknown = await import("@morrow/sdk/browser");
  assert.ok(typeof browser === "object" && browser !== null);
  assert.ok("prepareAssignment" in browser && "prepareBrowserAssignment" in browser);
  assert.ok(visited.size >= 5);
});
