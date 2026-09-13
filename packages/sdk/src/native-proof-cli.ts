import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  cc3Rpc,
  errorSummary,
  localConfiguration,
  provider,
  proverEndpoints,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";
import { obtainProof, verifyNativeProof } from "./proof.ts";

const transactionHash = process.argv[2];
if (!transactionHash) throw new Error("Provide a real Sepolia transaction hash");
const configuration = localConfiguration();
if (!configuration.SOURCE_CHAIN_RPC_URL) throw new Error("Missing source RPC configuration");
const source = provider(configuration.SOURCE_CHAIN_RPC_URL);
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
const startedAt = new Date().toISOString();

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const receipt = await source.getTransactionReceipt(transactionHash);
  if (!receipt) throw new Error("Source receipt not found");
  const { proof, raw } = await obtainProof(transactionHash, proverEndpoints[0]);
  if (proof.blockHeight !== BigInt(receipt.blockNumber)) throw new Error("Source block mismatch");
  const native = await verifyNativeProof(destination, proof);
  if (native.provenTxIndex !== BigInt(receipt.index))
    throw new Error("Source transaction index mismatch");
  const sourceReceipt: unknown = receipt.toJSON();
  const report = {
    evidenceKind: "historical-replay",
    purpose: "Native compatibility check only; not a Morrow trade or Stage A completion",
    startedAt,
    observedAt: new Date().toISOString(),
    transactionHash,
    sourceReceipt,
    proofService: proverEndpoints[0],
    rawProof: raw,
    native,
  };
  const text = JSON.stringify(
    report,
    (_, entry: unknown) => (typeof entry === "bigint" ? entry.toString() : entry),
    2,
  );
  const hash = createHash("sha256").update(text).digest("hex");
  const artifact = `evidence/native-read/${hash}.json`;
  await mkdir(`${repositoryRoot}evidence/native-read`, { recursive: true });
  await writeFile(`${repositoryRoot}${artifact}`, text, { flag: "wx" });
  process.stdout.write(
    `${JSON.stringify({ evidenceKind: report.evidenceKind, transactionHash, nativeValid: true, sourceBlock: receipt.blockNumber, receiptStatus: receipt.status, nativeTransactionIndex: native.provenTxIndex.toString(), artifact, sha256: hash })}\n`,
  );
} catch (error: unknown) {
  process.stderr.write(`${errorSummary(error)}\n`);
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
