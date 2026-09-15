import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { staticAnalysisResult } from "./static-analysis-result.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const binary = process.argv[2] ?? "slither";
const reportRoot = resolve(process.argv[3] ?? "evidence/local/static-analysis");
const svm = process.platform === "darwin" ? "Library/Application Support/svm" : ".svm";
const solc = process.env.MORROW_SOLC_BINARY ?? join(homedir(), svm, "0.8.28", "solc-0.8.28");
const targets = [
  "contracts/src/source/FundedPaymentVault.sol",
  "contracts/src/destination/MorrowMarket.sol",
  "contracts/src/testnet/MorrowTestToken.sol",
  "contracts/src/testnet/MorrowTestFaucet.sol",
  "contracts/src/source/StreamPaymentVault.sol",
  "contracts/src/destination/MorrowMarketV2.sol",
];

function portableJson(value) {
  return (
    JSON.stringify(
      value,
      (_, item) => (typeof item === "string" ? item.replaceAll(root, "") : item),
      2,
    ) + "\n"
  );
}

const version = spawnSync(binary, ["--version"], { encoding: "utf8", timeout: 30000 });
if (version.error) throw version.error;
if (version.status !== 0 || version.stdout.trim() !== "0.11.6")
  throw new Error("Static analysis requires Slither 0.11.6");
const compilerVersion = spawnSync(solc, ["--version"], { encoding: "utf8", timeout: 30000 });
if (compilerVersion.error) throw compilerVersion.error;
if (compilerVersion.status !== 0 || !/Version: 0\.8\.28\+/.test(compilerVersion.stdout))
  throw new Error("Static analysis requires Solidity 0.8.28");
await mkdir(reportRoot, { recursive: true });
const directory = await mkdtemp(join(reportRoot, "run-"));
const results = [];
for (const target of targets) {
  const name = target.split("/").at(-1).replace(".sol", "");
  const reportPath = join(directory, `${name}.json`);
  const args = [
    target,
    "--compile-force-framework",
    "solc",
    "--solc",
    solc,
    "--solc-remaps",
    "@openzeppelin/contracts/=packages/sdk/node_modules/@openzeppelin/contracts/ @gluwa/asc-contracts/=packages/sdk/node_modules/@gluwa/asc-contracts/",
    "--solc-args",
    "--optimize --optimize-runs 200 --via-ir --evm-version paris",
    "--filter-paths",
    "node_modules/",
    "--fail-medium",
    "--json",
    reportPath,
    "--sarif",
    join(directory, `${name}.sarif`),
  ];
  const run = spawnSync(binary, args, { cwd: root, encoding: "utf8", timeout: 120000 });
  if (run.error) throw run.error;
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  const output = run.stdout + run.stderr;
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const verdict = staticAnalysisResult(report, run.status, output);
  await writeFile(reportPath, portableJson(report));
  const sarifPath = join(directory, `${name}.sarif`);
  await writeFile(sarifPath, portableJson(JSON.parse(await readFile(sarifPath, "utf8"))));
  results.push({ target, ...verdict, reportPath: relative(root, reportPath) });
}
const passed = results.every((result) => result.passed);
const summary = {
  status: passed ? "PASS" : "FAIL",
  evidenceKind: "local-tested",
  observedAt: new Date().toISOString(),
  slitherVersion: "0.11.6",
  solcVersion: "0.8.28",
  failureThreshold: "Medium or High findings, compilation errors, or incomplete AST resolution",
  scope:
    "Deployed custody, market, stream vault, faucet and token entrypoints and their imported application libraries; dependencies excluded from findings",
  limitations:
    "Low and informational findings remain visible. Static analysis is not an audit or proof of correctness.",
  pathNormalization:
    "Repository-root prefixes removed from reports; finding contents and severities retained.",
  results,
};
await writeFile(join(directory, "summary.json"), JSON.stringify(summary, null, 2) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
if (!passed) process.exitCode = 1;
