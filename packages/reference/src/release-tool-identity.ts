import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { promisify } from "node:util";
import { root, EvidenceError } from "./checker-rpc.ts";

const execute = promisify(execFile);

export function assertReleaseToolUnchanged(before: unknown, after: unknown): void {
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw new EvidenceError("Checker source changed during release verification");
}

export async function releaseToolIdentity() {
  const git = async (args: string[]) =>
    (
      await execute("git", args, {
        cwd: root,
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 4 * 1024 * 1024,
      })
    ).stdout;
  const head = (await git(["rev-parse", "HEAD"])).trim();
  const base = await realpath(resolve(root, "packages/reference/src"));
  const paths = (
    await git([
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "packages/reference/src",
    ])
  )
    .split("\0")
    .filter(Boolean);
  const tree = (await git(["ls-tree", "-r", "-z", "HEAD", "--", "packages/reference/src"]))
    .split("\0")
    .filter(Boolean);
  const committed = new Map(
    tree.map((row) => {
      const match = /^100(?:644|755) blob ([0-9a-f]{40})\t(.+)$/.exec(row);
      if (!match?.[1] || !match[2]) throw new EvidenceError("Invalid checker source Git entry");
      return [match[2], match[1]];
    }),
  );
  const files = await Promise.all(
    [...new Set(paths)].sort().map(async (path) => {
      if (!/^packages\/reference\/src\/[A-Za-z0-9_-]+\.ts$/.test(path))
        throw new EvidenceError("Unexpected checker source path");
      const actual = await realpath(resolve(root, path));
      if (!actual.startsWith(base + sep))
        throw new EvidenceError("Checker source symlink leaves source directory");
      const bytes = await readFile(actual);
      const gitBlob = createHash("sha1")
        .update(`blob ${bytes.length.toString()}\0`)
        .update(bytes)
        .digest("hex");
      const committedBlob = committed.get(path) ?? null;
      return {
        path,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        gitBlob,
        committedBlob,
        matchesHead: gitBlob === committedBlob,
      };
    }),
  );
  return {
    head,
    files,
    matchesHead: files.length > 0 && files.every((file) => file.matchesHead),
    scope: "Actual checker source files; candidate application commit is recorded separately",
  };
}
