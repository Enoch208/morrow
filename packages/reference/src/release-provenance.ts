import { fileURLToPath } from "node:url";
import { compareReleaseFiles, git } from "./release-provenance-files.ts";
import { custodyContracts, verifyCustodyArtifact } from "./release-provenance-artifacts.ts";

export async function verifyReleaseProvenanceAt(root: string, commit: string) {
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error("Release requires an explicit full Git commit");
  if ((await git(root, ["cat-file", "-t", commit])).trim() !== "commit")
    throw new Error("Release object is not a Git commit");
  const { files, issues } = await compareReleaseFiles(root, commit);
  const artifacts = [];
  for (const name of custodyContracts) {
    try {
      artifacts.push(await verifyCustodyArtifact(root, name));
    } catch (error: unknown) {
      issues.push({
        code: "compiler-deployment-mismatch",
        path: `contracts/out/${name}.sol/${name}.json`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    status: issues.length === 0 ? ("PASS" as const) : ("FAIL" as const),
    evidenceKind: "local-tested" as const,
    implementationCommit: commit,
    observedAt: new Date().toISOString(),
    files,
    artifacts,
    issues,
    limitations: [
      "Static custody-source/configuration/artifact consistency only; no live RPC or constructor/runtime observation is performed.",
      "Existing compiler outputs are checked against pinned artifact metadata and actual source content; this command does not rebuild contracts.",
      "Historical deployment records retain their original commit field, including null; this comparison does not rewrite deployment history.",
      "SDK orchestration, worker, frontend, evidence outcomes and complete release identity require separate release checks.",
    ],
  };
}

export async function verifyReleaseProvenance(commit: string) {
  return verifyReleaseProvenanceAt(fileURLToPath(new URL("../../../", import.meta.url)), commit);
}
