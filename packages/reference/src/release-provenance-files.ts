import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const releaseScopes = [
  "contracts/src",
  "contracts/foundry.toml",
  "schemas",
  "deployments/custody",
  "packages/protocol/src",
  "packages/protocol/package.json",
  "packages/sdk/package.json",
  "packages/sdk/src/campaign-config.ts",
  "packages/sdk/src/custody-config.ts",
  "packages/sdk/src/c5-config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".nvmrc",
  ".npmrc",
  ".gitignore",
];

export interface ProvenanceIssue {
  code: string;
  path: string;
  message: string;
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected provenance object");
  return value as Record<string, unknown>;
}

export function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected provenance string");
  return value;
}

export async function git(root: string, args: readonly string[]): Promise<string> {
  const result = await execute("git", [...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  return result.stdout;
}

export async function safeRead(root: string, path: string): Promise<Buffer> {
  if (path.includes("\\") || path.split("/").some((part) => part === ".." || part === ""))
    throw new Error("Invalid provenance path");
  const base = await realpath(root);
  const target = await realpath(resolve(root, path));
  if (!target.startsWith(base + sep)) throw new Error("Provenance path leaves repository");
  return readFile(target);
}

export async function jsonFile(root: string, path: string): Promise<unknown> {
  return JSON.parse((await safeRead(root, path)).toString("utf8")) as unknown;
}

export async function compareReleaseFiles(root: string, commit: string) {
  const tree = await git(root, ["ls-tree", "-r", "-z", commit, "--", ...releaseScopes]);
  const expected = new Map<string, { mode: string; hash: string }>();
  for (const row of tree.split("\0").filter(Boolean)) {
    const [metadata, path] = row.split("\t");
    const [mode, type, hash] = (metadata ?? "").split(" ");
    if (!path || !mode || type !== "blob" || !hash) throw new Error("Invalid release Git tree");
    expected.set(path, { mode, hash });
  }
  if (expected.size === 0) throw new Error("Commit has no relevant release files");
  const current = (
    await git(root, [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...releaseScopes,
    ])
  )
    .split("\0")
    .filter(Boolean);
  const files = [];
  const issues: ProvenanceIssue[] = [];
  for (const path of [...new Set([...expected.keys(), ...current])].sort()) {
    const pinned = expected.get(path);
    let actualBlob: string | null = null;
    let actualSha256: string | null = null;
    try {
      const stat = await lstat(resolve(root, path));
      if (!stat.isFile()) throw new Error("Release input must be a regular file");
      const bytes = await safeRead(root, path);
      actualBlob = createHash("sha1")
        .update(`blob ${bytes.length.toString()}\0`)
        .update(bytes)
        .digest("hex");
      actualSha256 = sha256(bytes);
      if (pinned?.mode !== "100644" && pinned?.mode !== "100755")
        throw new Error("Release input absent from commit or not a regular Git blob");
      if (actualBlob !== pinned.hash)
        throw new Error("Working-tree bytes differ from explicit commit");
    } catch (error: unknown) {
      issues.push({
        code: "candidate-file-mismatch",
        path,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    files.push({
      path,
      expectedBlob: pinned?.hash ?? null,
      actualBlob,
      sha256: actualSha256,
      matches: actualBlob !== null && actualBlob === pinned?.hash,
    });
  }
  return { files, issues };
}
