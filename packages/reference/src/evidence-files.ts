import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { root, EvidenceError } from "./checker-rpc.ts";
import type { ArtifactReference } from "./manifest-types.ts";

export function safeArtifactPath(value: string): string {
  if (
    !/^(evidence|deployments|schemas)\/[A-Za-z0-9_/-]+(?:[.][A-Za-z0-9_-]+)*$/.test(value) ||
    value.split("/").some((part) => part === ".." || part === "." || part === "")
  )
    throw new EvidenceError("Artifact path is outside public evidence directories");
  return value;
}

export function verifyArtifactBytes(bytes: Uint8Array, sha256: string): void {
  if (!/^[0-9a-f]{64}$/.test(sha256) || createHash("sha256").update(bytes).digest("hex") !== sha256)
    throw new EvidenceError("Evidence artifact content hash mismatch");
}

export async function readPublicArtifact(path: string): Promise<Buffer> {
  safeArtifactPath(path);
  const resolved = await realpath(resolve(root, path));
  const allowedRoot = await realpath(resolve(root, path.split("/")[0] ?? ""));
  const repository = await realpath(root);
  if (!allowedRoot.startsWith(repository + sep))
    throw new EvidenceError("Public artifact root leaves the repository");
  if (!resolved.startsWith(allowedRoot + sep))
    throw new EvidenceError("Artifact symlink leaves public directory");
  return await readFile(resolved);
}

export async function checkedArtifact(reference: ArtifactReference): Promise<Buffer> {
  const bytes = await readPublicArtifact(reference.path);
  verifyArtifactBytes(bytes, reference.sha256);
  return bytes;
}

export async function artifactReference(path: string): Promise<ArtifactReference> {
  const bytes = await readPublicArtifact(path);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function storeEvidence(value: unknown): Promise<ArtifactReference> {
  assertPublicEvidence(value);
  const bytes =
    JSON.stringify(
      value,
      (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
      2,
    ) + "\n";
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `evidence/blobs/${sha256}.json`;
  await mkdir(`${root}evidence/blobs`, { recursive: true });
  try {
    await writeFile(`${root}${path}`, bytes, { flag: "wx" });
  } catch (error: unknown) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    await checkedArtifact({ path, sha256 });
  }
  return { path, sha256 };
}

export function assertPublicEvidence(value: unknown): void {
  if (Array.isArray(value)) {
    for (const entry of value as unknown[]) assertPublicEvidence(entry);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (/(private.?key|mnemonic|password|access.?token|authorization|client.?secret)/i.test(key))
        throw new EvidenceError("Secret-bearing field cannot enter public evidence");
      assertPublicEvidence(entry);
    }
  }
}

export function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new EvidenceError("Expected evidence object");
  return value as Record<string, unknown>;
}

export function string(value: unknown): string {
  if (typeof value !== "string") throw new EvidenceError("Expected evidence string");
  return value;
}

export function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new EvidenceError("Expected nonnegative safe evidence integer");
  return value;
}
