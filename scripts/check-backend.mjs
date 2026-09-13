import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const commands = [
  ["forge", ["test", "--root", "contracts"]],
  ...["@morrow/protocol", "@morrow/sdk", "@morrow/reference", "@morrow/worker"].flatMap(
    (workspace) =>
      ["test", "typecheck", "lint"].map((task) => ["pnpm", ["--filter", workspace, task]]),
  ),
];
const results = [];
for (const [command, args] of commands) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 120000 });
  if (result.error) throw result.error;
  results.push({
    command: [command, ...args],
    exitCode: result.status,
    elapsedMs: Date.now() - started,
    stdout: result.stdout,
    stderr: result.stderr,
  });
  process.stdout.write(
    [command, ...args].join(" ") + ": " + (result.status === 0 ? "passed" : "failed") + "\n",
  );
}
const path = `evidence/local/backend-check-${Date.now()}.json`;
await mkdir(`${root}evidence/local`, { recursive: true });
await writeFile(
  `${root}${path}`,
  JSON.stringify(
    {
      observedAt: new Date().toISOString(),
      evidenceKind: "local-tested",
      scope: "Owned backend workspaces; not a full release check",
      results,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
process.stdout.write(path + "\n");
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1;
