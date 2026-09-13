import { mutationCases as cases } from "./mutation-cases.mjs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "morrow-mutations-"));
const target = join(temporary, "contracts");

function run(test) {
  const args = ["test", "--root", target];
  if (test) args.push("--match-test", test);
  const result = spawnSync("forge", args, { encoding: "utf8", timeout: 120000 });
  if (result.error) throw result.error;
  return {
    command: ["forge", ...args],
    status: result.status,
    output: result.stdout + result.stderr,
  };
}

try {
  await mkdir(target);
  for (const path of ["src", "test", "foundry.toml"])
    await cp(join(root, "contracts", path), join(target, path), { recursive: true });
  await mkdir(join(temporary, "packages", "sdk"), { recursive: true });
  await symlink(
    join(root, "packages", "sdk", "node_modules"),
    join(temporary, "packages", "sdk", "node_modules"),
  );
  await symlink(join(root, "node_modules"), join(temporary, "node_modules"));
  const baseline = run();
  if (baseline.status !== 0) throw new Error("Mutation baseline failed: " + baseline.output);
  const results = [];
  for (const candidate of cases) {
    const path = join(target, candidate.file);
    const original = await readFile(path, "utf8");
    if (original.split(candidate.guard).length !== 2)
      throw new Error("Mutation guard not unique: " + candidate.name);
    await writeFile(path, original.replace(candidate.guard, candidate.replacement ?? ""));
    const result = run(candidate.test);
    await writeFile(path, original);
    const killed =
      result.status !== 0 &&
      result.output.includes("[FAIL:") &&
      result.output.includes(candidate.test) &&
      !result.output.includes("Compiler run failed");
    results.push({
      ...candidate,
      originalSha256: createHash("sha256").update(original).digest("hex"),
      killed,
      ...result,
    });
    process.stdout.write(
      candidate.name + ": " + (killed ? "killed" : "survived or invalid") + "\n",
    );
  }
  const directory = join(root, "evidence", "local");
  await mkdir(directory, { recursive: true });
  const path = join(directory, `mutations-${Date.now()}.json`);
  await writeFile(
    path,
    JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        evidenceKind: "local-tested",
        scope: `${cases.length} selected mutations including six required classes and a combined outcome-binding mutation; not every safety guard`,
        baseline,
        results,
      },
      null,
      2,
    ),
  );
  process.stdout.write(path + "\n");
  if (results.some((result) => !result.killed)) process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
