import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const root = new URL("../", import.meta.url);
const directory = new URL("schemas/abi/", root);
await mkdir(directory, { recursive: true });
const hashes = {};
const require = createRequire(new URL("../packages/sdk/package.json", import.meta.url));
for (const name of ["FundedPaymentVault", "MorrowMarket", "MorrowTestToken"]) {
  const artifact = JSON.parse(
    await readFile(new URL(`contracts/out/${name}.sol/${name}.json`, root), "utf8"),
  );
  if (!Array.isArray(artifact.abi)) throw new Error(`Missing compiled ABI: ${name}`);
  const content = JSON.stringify(artifact.abi, null, 2) + "\n";
  await writeFile(new URL(`${name}.json`, directory), content);
  hashes[name] = createHash("sha256").update(content).digest("hex");
}
const native = await readFile(
  require.resolve("@gluwa/usc-sdk/dist/block-prover/block_prover.json"),
  "utf8",
);
const nativeContent = JSON.stringify(JSON.parse(native), null, 2) + "\n";
await writeFile(new URL("BlockProver.json", directory), nativeContent);
hashes.BlockProver = createHash("sha256").update(nativeContent).digest("hex");
await writeFile(new URL("hashes.json", directory), JSON.stringify(hashes, null, 2) + "\n");
process.stdout.write(JSON.stringify(hashes) + "\n");
