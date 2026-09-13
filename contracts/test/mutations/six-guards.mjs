import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "morrow-six-guards-"));
const target = join(temporary, "contracts");
const cases = [
  {
    name: "emitter binding",
    file: "src/libraries/AttestcoinGate.sol",
    guard: "if (entry.address_ != expectedEmitter) revert WrongEmitter();",
    test: "test_T24_nativeValidUnapprovedEmitterRejected",
  },
  {
    name: "round binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard: "entry.topics[2] != bytes32(terms.claimId) || entry.topics[3] != bytes32(terms.round)",
    replacement: "entry.topics[2] != bytes32(terms.claimId)",
    test: "test_T31_claimAndRoundTopicsMustMatchEvenWithMatchingSaleHash",
  },
  {
    name: "destination-domain binding",
    file: "src/destination/MarketTerms.sol",
    guard: "|| terms.destinationEvmChainId != block.chainid || terms.destinationMarket != address(this)",
    test: "test_T32_authenticOtherDestinationCannotFundHere",
  },
  {
    name: "terminal-state check",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (sale.state != MarketTypes.State.BOUND) revert SaleNotBound();",
    test: "test_T37_T39_lateAssignmentAllocatesExactlyOnce",
  },
  {
    name: "exact deposit delta",
    file: "src/destination/MorrowMarket.sol",
    guard:
      "if (SETTLEMENT_TOKEN.balanceOf(address(this)) != beforeBalance + price) revert TransferDeltaMismatch();",
    test: "test_T34_taxedFundingRollsBackMoneyStateAndConsumption",
  },
  {
    name: "withdrawal replay guard",
    file: "src/destination/MorrowMarket.sol",
    guard: "credits[msg.sender] = 0;",
    test: "test_withdrawalOnlyPaysCallerAndCannotRepeat",
  },
];

function run(test) {
  const args = ["test", "--root", target, "--match-test", test];
  const result = spawnSync("forge", args, { encoding: "utf8", timeout: 120000 });
  if (result.error) throw result.error;
  return result;
}

try {
  await mkdir(target);
  for (const path of ["src", "test", "foundry.toml"])
    await cp(join(root, "contracts", path), join(target, path), { recursive: true });
  await mkdir(join(temporary, "packages", "sdk"), { recursive: true });
  await symlink(join(root, "packages", "sdk", "node_modules"), join(temporary, "packages", "sdk", "node_modules"));
  await symlink(join(root, "node_modules"), join(temporary, "node_modules"));
  const baseline = run("test_T20_fundingEntersBoundWithExactPrincipal");
  if (baseline.status !== 0) throw new Error("Six-guard baseline failed: " + baseline.stdout + baseline.stderr);
  const results = [];
  for (const candidate of cases) {
    const path = join(target, candidate.file);
    const original = await readFile(path, "utf8");
    if (original.split(candidate.guard).length !== 2)
      throw new Error("Mutation guard not unique: " + candidate.name);
    await writeFile(path, original.replace(candidate.guard, candidate.replacement ?? ""));
    const result = run(candidate.test);
    await writeFile(path, original);
    const output = result.stdout + result.stderr;
    const killed =
      result.status !== 0 &&
      output.includes("[FAIL:") &&
      output.includes(candidate.test) &&
      !output.includes("Compiler run failed");
    results.push({ name: candidate.name, test: candidate.test, killed });
    process.stdout.write(candidate.name + ": " + (killed ? "killed" : "survived") + "\n");
  }
  const survivors = results.filter((result) => !result.killed);
  if (survivors.length > 0) {
    process.stdout.write("SURVIVED: " + survivors.map((result) => result.name).join(", ") + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("six mandatory guards killed: " + String(results.length) + "\n");
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
