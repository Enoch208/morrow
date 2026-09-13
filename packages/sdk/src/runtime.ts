import { readFileSync } from "node:fs";
import { isHexString } from "ethers";
import { repositoryRoot } from "./environment.ts";

export interface ImmutableRange {
  readonly start: number;
  readonly length: number;
}

export function maskImmutables(code: string, ranges: readonly ImmutableRange[]): string {
  if (!isHexString(code) || code.length % 2 !== 0) throw new Error("Invalid runtime bytecode");
  let masked = code.toLowerCase();
  for (const { start, length } of ranges) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < 0 ||
      length <= 0 ||
      (start + length) * 2 + 2 > code.length
    )
      throw new Error("Invalid immutable byte range");
    masked =
      masked.slice(0, start * 2 + 2) + "00".repeat(length) + masked.slice((start + length) * 2 + 2);
  }
  return masked;
}

export function compiledRuntime(name: string): {
  code: string;
  ranges: ImmutableRange[];
  artifactText: string;
} {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error("Invalid artifact name");
  const artifactText = readFileSync(
    `${repositoryRoot}contracts/out/${name}.sol/${name}.json`,
    "utf8",
  );
  const artifact: unknown = JSON.parse(artifactText);
  if (typeof artifact !== "object" || artifact === null || !("deployedBytecode" in artifact))
    throw new Error("No compiled runtime");
  const runtime = artifact.deployedBytecode;
  if (
    typeof runtime !== "object" ||
    runtime === null ||
    !("object" in runtime) ||
    typeof runtime.object !== "string"
  )
    throw new Error("Invalid compiled runtime");
  const ranges: ImmutableRange[] = [];
  const immutableReferences: unknown =
    "immutableReferences" in runtime ? runtime.immutableReferences : {};
  if (typeof immutableReferences !== "object" || immutableReferences === null)
    throw new Error("Invalid immutable reference map");
  for (const entries of Object.values(immutableReferences)) {
    if (!Array.isArray(entries)) throw new Error("Invalid immutable references");
    for (const entry of entries as unknown[]) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("start" in entry) ||
        typeof entry.start !== "number" ||
        !("length" in entry) ||
        typeof entry.length !== "number"
      )
        throw new Error("Invalid immutable reference");
      ranges.push({ start: entry.start, length: entry.length });
    }
  }
  return { code: runtime.object, ranges, artifactText };
}
