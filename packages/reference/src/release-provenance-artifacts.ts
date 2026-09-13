import { Interface, isHexString, keccak256 } from "ethers";
import { canonicalJson } from "./canonical-json.ts";
import { jsonFile, record, safeRead, sha256, string } from "./release-provenance-files.ts";
import { verifyCompilerSettings, verifyMetadataSources } from "./release-provenance-metadata.ts";

export const custodyProvenancePath = "deployments/custody/provenance-1789252172280.json";
export const custodyContracts = ["FundedPaymentVault", "MorrowMarket", "MorrowTestToken"] as const;

function bytecode(value: unknown): string {
  const result = string(record(value).object);
  if (!isHexString(result) || result.length < 4)
    throw new Error("Missing or invalid compiler bytecode");
  return result;
}

function normalizedAbi(value: unknown): string {
  if (!Array.isArray(value)) throw new Error("Missing ABI array");
  return canonicalJson(
    new Interface(JSON.stringify(value)).fragments
      .map((fragment) => fragment.format("json"))
      .sort(),
  );
}

export function compareCompilerArtifact(pinned: unknown, compiled: unknown): void {
  const expected = record(pinned);
  const actual = record(compiled);
  for (const field of ["bytecode", "deployedBytecode"] as const) {
    if (bytecode(expected[field]) !== bytecode(actual[field]))
      throw new Error(`Compiler ${field} differs from pinned deployment artifact`);
    if (
      canonicalJson(record(expected[field]).linkReferences) !==
      canonicalJson(record(actual[field]).linkReferences)
    )
      throw new Error("Compiler library links differ from pinned deployment artifact");
  }
  for (const field of ["abi", "methodIdentifiers", "metadata"] as const)
    if (canonicalJson(expected[field]) !== canonicalJson(actual[field]))
      throw new Error(`Compiler ${field} differs from pinned deployment artifact`);
  if (!Array.isArray(actual.abi) || actual.abi.length === 0)
    throw new Error("Compiler ABI unavailable");
  const raw = string(actual.rawMetadata);
  if (raw !== string(expected.rawMetadata))
    throw new Error("Compiler raw metadata differs from pinned metadata");
  if (normalizedAbi(record(record(actual.metadata).output).abi) !== normalizedAbi(actual.abi))
    throw new Error("Compiler ABI differs from authenticated metadata ABI");
  const offsets = (artifact: Record<string, unknown>) =>
    Object.values(record(record(artifact.deployedBytecode).immutableReferences))
      .map((value) => {
        if (!Array.isArray(value)) throw new Error("Invalid compiler immutable references");
        return canonicalJson((value as unknown[]).map(canonicalJson).sort());
      })
      .sort();
  if (canonicalJson(offsets(expected)) !== canonicalJson(offsets(actual)))
    throw new Error("Compiler immutable offsets differ from pinned deployment artifact");
}

export async function verifyCustodyArtifact(root: string, name: (typeof custodyContracts)[number]) {
  const provenance = record(await jsonFile(root, custodyProvenancePath));
  if (!Array.isArray(provenance.deployments)) throw new Error("Missing custody deployments");
  const entries = provenance.deployments.map(record).filter((value) => value.contractName === name);
  if (entries.length !== (name === "MorrowTestToken" ? 2 : 1))
    throw new Error("Unexpected custody deployment count");
  const first = entries[0];
  if (!first) throw new Error("Missing custody deployment");
  const artifactPath = string(first.artifactPath);
  const artifactHash = string(first.artifactSha256);
  if (
    !/^[0-9a-f]{64}$/.test(artifactHash) ||
    artifactPath !== `deployments/custody/${name}-${artifactHash}.artifact.json`
  )
    throw new Error("Invalid pinned custody artifact path/hash");
  const pinnedBytes = await safeRead(root, artifactPath);
  if (sha256(pinnedBytes) !== artifactHash)
    throw new Error("Pinned deployment artifact bytes changed");
  const pinned: unknown = JSON.parse(pinnedBytes.toString("utf8"));
  const compiledPath = `contracts/out/${name}.sol/${name}.json`;
  const compiled = record(await jsonFile(root, compiledPath));
  compareCompilerArtifact(pinned, compiled);
  const metadata = record(compiled.metadata);
  const target = record(record(metadata.settings).compilationTarget);
  const expectedTarget =
    name === "FundedPaymentVault" ? "source" : name === "MorrowMarket" ? "destination" : "testnet";
  if (canonicalJson(target) !== canonicalJson({ [`src/${expectedTarget}/${name}.sol`]: name }))
    throw new Error("Compiler compilation target differs from custody contract");
  verifyCompilerSettings(
    metadata,
    (await safeRead(root, "contracts/foundry.toml")).toString("utf8"),
  );
  const sources = await verifyMetadataSources(root, metadata);
  const abiPath = `schemas/abi/${name}.json`;
  const abiBytes = await safeRead(root, abiPath);
  if (
    canonicalJson(JSON.parse(abiBytes.toString("utf8")) as unknown) !== canonicalJson(compiled.abi)
  )
    throw new Error("Published ABI differs from pinned compiler ABI");
  if (record(await jsonFile(root, "schemas/abi/hashes.json"))[name] !== sha256(abiBytes))
    throw new Error("Published ABI hash differs from actual bytes");
  const creationBytecodeHash = keccak256(bytecode(compiled.bytecode));
  for (const entry of entries)
    if (
      entry.artifactPath !== artifactPath ||
      entry.artifactSha256 !== artifactHash ||
      entry.creationBytecodeHash !== creationBytecodeHash
    )
      throw new Error("Deployment record differs from compiled creation bytecode");
  return {
    contractName: name,
    artifactPath,
    artifactSha256: artifactHash,
    compiledPath,
    creationBytecodeHash,
    runtimeTemplateHash: keccak256(bytecode(compiled.deployedBytecode)),
    compilerVersion: string(record(metadata.compiler).version),
    abiSha256: sha256(abiBytes),
    sources,
    recordedDeploymentCommit: provenance.implementationCommit ?? null,
  };
}
