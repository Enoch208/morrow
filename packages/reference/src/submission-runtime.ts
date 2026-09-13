import { readFile } from "node:fs/promises";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError, root } from "./checker-rpc.ts";
import { record, string } from "./evidence-files.ts";
import { applicationPins } from "./manifest-chain.ts";
import { verifyCustodyArtifact } from "./release-provenance-artifacts.ts";
import { compareRuntime, inspectDispatcher } from "./submission-bytecode.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import { canonicalPoint } from "./submission-history.ts";

export async function submissionRuntime(role: "vault" | "market", rpc: JsonRpcProvider) {
  const name = role === "vault" ? "FundedPaymentVault" : "MorrowMarket";
  let provenance;
  try {
    provenance = await verifyCustodyArtifact(root, name);
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") throw error;
    throw new EvidenceError(error instanceof Error ? error.message : "Invalid compiler provenance");
  }
  const artifact = record(
    JSON.parse(await readFile(`${root}${provenance.compiledPath}`, "utf8")) as unknown,
  );
  const template = record(artifact.deployedBytecode);
  if ((await rpc.getNetwork()).chainId.toString() !== applicationPins[role].chainId)
    throw new EvidenceError("Runtime RPC is on the wrong chain");
  const block = await rpc.getBlock("latest");
  if (!block?.hash) throw new SubmissionUnverified("Runtime observation block unavailable");
  const code = await rpc.getCode(applicationPins[role].address, block.number);
  const runtime = compareRuntime(code, string(template.object), template.immutableReferences);
  const inspection = inspectDispatcher(code, JSON.stringify(artifact.abi));
  await canonicalPoint(rpc, block.number, block.hash);
  return {
    runtime,
    inspection,
    provenance,
    address: applicationPins[role].address,
    blockNumber: block.number,
    blockHash: block.hash,
  };
}

export function bytecodeObservation(
  status: "pass" | "fail" | "unverified",
  detail: string,
  evidence: unknown,
) {
  if (status === "fail") throw new EvidenceError(detail);
  if (status === "unverified") throw new SubmissionUnverified(detail, evidence);
  return { detail, evidence };
}
