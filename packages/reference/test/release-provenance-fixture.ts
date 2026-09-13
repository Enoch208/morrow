import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git, record, releaseScopes, string } from "../src/release-provenance-files.ts";
import { custodyContracts, custodyProvenancePath } from "../src/release-provenance-artifacts.ts";

export const sourceRoot = fileURLToPath(new URL("../../../", import.meta.url));

export async function provenanceFixture() {
  const root = await mkdtemp(join(tmpdir(), "morrow-provenance-"));
  const commit = (await git(sourceRoot, ["rev-parse", "HEAD"])).trim();
  await git(sourceRoot, ["init", "--quiet", root]);
  const objects = resolve(
    sourceRoot,
    (await git(sourceRoot, ["rev-parse", "--git-path", "objects"])).trim(),
  );
  await writeFile(join(root, ".git/objects/info/alternates"), objects + "\n");
  const paths = (
    await git(sourceRoot, ["ls-tree", "-r", "--name-only", "-z", commit, "--", ...releaseScopes])
  )
    .split("\0")
    .filter(Boolean);
  const save = async (path: string, bytes: string | Buffer) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), bytes);
  };
  for (const path of paths) await save(path, await git(sourceRoot, ["show", `${commit}:${path}`]));
  const provenance = record(
    JSON.parse(await readFile(join(root, custodyProvenancePath), "utf8")) as unknown,
  );
  if (!Array.isArray(provenance.deployments)) throw new Error("Missing fixture deployment records");
  for (const name of custodyContracts) {
    const deployment = provenance.deployments
      .map(record)
      .find((entry) => entry.contractName === name);
    if (!deployment) throw new Error("Missing fixture deployment");
    const bytes = await readFile(join(root, string(deployment.artifactPath)));
    const artifact = record(JSON.parse(bytes.toString("utf8")) as unknown);
    await save(`contracts/out/${name}.sol/${name}.json`, bytes);
    for (const path of Object.keys(record(record(artifact.metadata).sources))) {
      if (!path.startsWith("../packages/sdk/node_modules/")) continue;
      const relative = path.slice(3);
      await save(relative, await readFile(join(sourceRoot, relative)));
    }
  }
  return { root, commit, save };
}
