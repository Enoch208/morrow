import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { storeEvidence } from "../packages/reference/src/evidence-files.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["pnpm", "--filter", "@morrow-protocol/sdk", "build"],
  ["pnpm", "--filter", "@morrow-protocol/sdk", "test"],
  ["pnpm", "--filter", "@morrow-protocol/sdk", "lint"],
  ["pnpm", "--filter", "@morrow-protocol/sdk", "typecheck"],
  ["forge", "test", "--root", "examples/payout-registrar"],
];
const results = commands.map(([command, ...args]) => {
  const started = Date.now();
  const run = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120000 });
  if (run.error) throw run.error;
  const result = {
    command: [command, ...args],
    exitCode: run.status,
    elapsedMs: Date.now() - started,
    stdout: run.stdout.replaceAll(root, ""),
    stderr: run.stderr.replaceAll(root, ""),
  };
  process.stdout.write(`${result.command.join(" ")}: ${result.exitCode === 0 ? "PASS" : "FAIL"}\n`);
  return result;
});
const artifact = await storeEvidence({
  observedAt: new Date().toISOString(),
  evidenceKind: "local-tested",
  scope:
    "Public SDK build/tests/lint/types and local contract-payer registration; not npm publication, live registration or an audit",
  results,
});
process.stdout.write(artifact.path + "\n");
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
