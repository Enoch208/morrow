import { keccak256 } from "ethers";
import { canonicalJson } from "./canonical-json.ts";
import { record, safeRead, sha256, string } from "./release-provenance-files.ts";

function setting(configuration: string, key: string): unknown {
  const profile = configuration.split(/^\[profile\.default\]\s*$/m)[1]?.split(/^\[/m)[0];
  if (!profile) throw new Error("Missing default compiler profile");
  const matches = [...profile.matchAll(new RegExp(`^${key}\\s*=\\s*(.+)$`, "gm"))];
  if (matches.length !== 1 || !matches[0]?.[1])
    throw new Error(`Missing or duplicate compiler setting ${key}`);
  return JSON.parse(matches[0][1]) as unknown;
}

export function verifyCompilerSettings(
  metadata: Record<string, unknown>,
  configuration: string,
): void {
  const settings = record(metadata.settings);
  const compiler = string(record(metadata.compiler).version);
  const version = string(setting(configuration, "solc_version"));
  if (!compiler.startsWith(version + "+commit."))
    throw new Error("Compiler version differs from configuration");
  for (const [field, key] of [
    ["evmVersion", "evm_version"],
    ["viaIR", "via_ir"],
  ] as const)
    if (settings[field] !== setting(configuration, key))
      throw new Error(`Compiler ${field} differs from configuration`);
  if (
    record(settings.optimizer).enabled !== setting(configuration, "optimizer") ||
    record(settings.optimizer).runs !== setting(configuration, "optimizer_runs") ||
    record(settings.metadata).bytecodeHash !== setting(configuration, "bytecode_hash") ||
    canonicalJson(settings.remappings) !== canonicalJson(setting(configuration, "remappings")) ||
    canonicalJson(settings.libraries) !== "{}"
  )
    throw new Error(
      "Compiler optimizer, metadata, remappings or libraries differ from configuration",
    );
}

export async function verifyMetadataSources(root: string, metadata: Record<string, unknown>) {
  const sources = record(metadata.sources);
  if (Object.keys(sources).length === 0) throw new Error("Compiler metadata has no sources");
  const results = [];
  for (const [source, value] of Object.entries(sources)) {
    let path: string;
    if (/^src\/[A-Za-z0-9_./-]+\.sol$/.test(source)) path = `contracts/${source}`;
    else if (
      /^\.\.\/packages\/sdk\/node_modules\/@(?:gluwa\/asc-contracts|openzeppelin\/contracts)\/[A-Za-z0-9_./-]+\.sol$/.test(
        source,
      )
    )
      path = source.slice(3);
    else throw new Error("Compiler source path is outside approved source/dependency roots");
    const expected = string(record(value).keccak256);
    if (!/^0x[0-9a-f]{64}$/.test(expected)) throw new Error("Invalid compiler source content hash");
    const bytes = await safeRead(root, path);
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const normalized = content.replaceAll("\r\n", "\n");
    const actual = keccak256(Buffer.from(normalized));
    if (actual !== expected)
      throw new Error(`Stale compiler output: source hash differs for ${path}`);
    results.push({
      path,
      keccak256: actual,
      rawSha256: sha256(bytes),
      lineEndingsNormalized: normalized !== content,
    });
  }
  return results;
}
