import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { contractArtifact } from "../src/artifact.ts";
import { contractInterfaces } from "../src/contract-reads.ts";
import { campaignContracts } from "../src/campaign-config.ts";
import { faucetInterface } from "../src/faucet-pins.ts";

await test("public SDK bundles for browsers without Node resolution or external shims", async () => {
  const result = await build({
    entryPoints: [fileURLToPath(import.meta.resolve("@morrow/sdk/browser"))],
    bundle: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    write: false,
    metafile: true,
    logLevel: "silent",
  });
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.outputFiles.length, 1);
  for (const path of Object.keys(result.metafile.inputs)) {
    assert.doesNotMatch(path, /\/(environment|artifact|campaign-chain|campaign-log)\.ts$/);
    assert.doesNotMatch(path, /geturl-node|\.env/);
  }
  for (const output of Object.values(result.metafile.outputs)) {
    assert.equal(output.imports.length, 0);
    assert.ok(output.exports.includes("prepareBrowserAssignment"));
    for (const name of [
      "prepareBrowserReservation",
      "prepareBrowserFunding",
      "prepareBrowserSettlement",
      "prepareBrowserWithdrawal",
      "prepareBrowserSaleProof",
      "confirmPreparedWallet",
      "prepareBrowserFaucetDrip",
      "prepareBrowserClaimApproval",
      "prepareBrowserClaim",
      "prepareBrowserCancellation",
      "prepareBrowserCancellationRecognition",
      "prepareBrowserRedemption",
      "readWalletActivity",
    ])
      assert.ok(output.exports.includes(name));
  }
});

await test("browser contract interfaces match compiler-derived contract ABIs", () => {
  for (const key of ["vault", "market", "sourceToken", "settlementToken"] as const) {
    const compiled = contractArtifact(campaignContracts[key].name).abi;
    assert.deepEqual(contractInterfaces[key].format(true), compiled.format(true));
  }
});

await test("browser faucet interface matches the compiled faucet ABI", () => {
  assert.deepEqual(
    faucetInterface.format(true),
    contractArtifact("MorrowTestFaucet").abi.format(true),
  );
});
