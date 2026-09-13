import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "morrow-mutations-"));
const target = join(temporary, "contracts");
const cases = [
  {
    name: "source incoming delta",
    file: "src/source/FundedPaymentVault.sol",
    guard:
      "if (SOURCE_TOKEN.balanceOf(address(this)) != balanceBefore + faceValueRaw) revert TransferDeltaMismatch();",
    test: "test_T02_sourceTaxCannotCreateUnbackedClaim",
  },
  {
    name: "source assignment cutoff",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (block.timestamp >= round.terms.assignBefore) revert AssignmentExpired();",
    test: "test_T10_T11_assignmentAndCancellationBoundary",
  },
  {
    name: "source cancellation cutoff",
    file: "src/source/FundedPaymentVault.sol",
    guard: "if (block.timestamp < round.terms.assignBefore) revert CancellationTooEarly();",
    test: "test_T12_earlyCancellationRejected",
  },
  {
    name: "buyer authority",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (msg.sender != terms.buyer) revert NotBuyer();",
    test: "test_T33_T36_nonBuyerCannotConsumeReservation",
  },
  {
    name: "destination incoming delta",
    file: "src/destination/MorrowMarket.sol",
    guard:
      "if (SETTLEMENT_TOKEN.balanceOf(address(this)) != beforeBalance + price) revert TransferDeltaMismatch();",
    test: "test_T34_taxedFundingRollsBackMoneyStateAndConsumption",
  },
  {
    name: "funding admission cutoff",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (block.timestamp >= terms.fundBefore) revert FundingClosed();",
    test: "test_fundingCutoffIsStrictButNeverAnExit",
  },
  {
    name: "approved source emitter",
    file: "src/libraries/AttestcoinGate.sol",
    guard: "if (entry.address_ != expectedEmitter) revert WrongEmitter();",
    test: "test_T24_nativeValidUnapprovedEmitterRejected",
  },
  {
    name: "withdrawal credit consumption",
    file: "src/destination/MorrowMarket.sol",
    guard: "credits[msg.sender] = 0;",
    test: "test_withdrawalOnlyPaysCallerAndCannotRepeat",
  },
  {
    name: "claim and round binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "if (entry.topics[2] != bytes32(terms.claimId) || entry.topics[3] != bytes32(terms.round)) {\n            revert ClaimRoundMismatch();\n        }",
    test: "test_T31_claimAndRoundTopicsMustMatchEvenWithMatchingSaleHash",
  },
  {
    name: "destination deployment binding",
    file: "src/destination/MarketTerms.sol",
    guard:
      "|| terms.destinationEvmChainId != block.chainid || terms.destinationMarket != address(this)",
    test: "test_T32_authenticOtherDestinationCannotFundHere",
  },
  {
    name: "terminal state guard",
    file: "src/destination/MorrowMarket.sol",
    guard: "if (sale.state != MarketTypes.State.BOUND) revert SaleNotBound();",
    test: "test_T37_T39_lateAssignmentAllocatesExactlyOnce",
  },
  {
    name: "combined outcome identity and terms binding",
    file: "src/libraries/ProofBindingLib.sol",
    guard:
      "bindIdentity(entry, terms);\n        if (entry.data.length != 32) revert InvalidEventLayout();\n        if (abi.decode(entry.data, (bytes32)) != SaleTermsLib.termsHash(terms)) revert TermsHashMismatch();",
    replacement: "if (entry.data.length != 32) revert InvalidEventLayout();",
    test: "test_T42_T45_T57_oldRefundDeliveredAfterNewAssignmentStaysRoundSpecific",
  },
  {
    name: "receipt-local event identity",
    file: "src/libraries/AttestcoinGate.sol",
    guard:
      "eventKey = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, receiptLocalLogIndex));",
    replacement:
      "eventKey = keccak256(abi.encode(proof.chainKey, proof.blockHeight, txIndex, uint256(0)));",
    test: "test_T47_distinctLocalIndicesFundInForwardOrder",
  },
];

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
