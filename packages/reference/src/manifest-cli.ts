import { mkdir, writeFile } from "node:fs/promises";
import { EvidenceError, root, rpcPair } from "./checker-rpc.ts";
import { buildManifest } from "./manifest-builder.ts";
import { manifestSchema } from "./manifest-schema.ts";
import { checkManifestState } from "./manifest-state-check.ts";

const name = process.argv[2];
if (name !== "gate" && name !== "a" && name !== "b") throw new EvidenceError("Choose gate, a or b");
const { source, destination } = rpcPair();
try {
  const manifest = await buildManifest(name, source, destination);
  checkManifestState(manifest);
  await mkdir(`${root}evidence/manifests`, { recursive: true });
  await writeFile(
    `${root}schemas/campaign-v1.schema.json`,
    JSON.stringify(manifestSchema, null, 2) + "\n",
  );
  const path = `evidence/manifests/${name}-${Date.now().toString()}.json`;
  await writeFile(`${root}${path}`, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(
    JSON.stringify({
      path,
      schemaValid: true,
      state: manifest.actualOutcome,
      unresolvedFacts: manifest.unresolvedFacts,
    }) + "\n",
  );
} catch (error: unknown) {
  process.stderr.write(
    "UNVERIFIABLE: " +
      (error instanceof EvidenceError
        ? error.message
        : "Manifest generation failed; dependency or data unavailable") +
      "\n",
  );
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
