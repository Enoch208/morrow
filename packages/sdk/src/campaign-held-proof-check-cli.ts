import { heldAssignmentProof } from "./campaign-held-proof.ts";
import { cc3Rpc, provider, requireTestnet, errorSummary } from "./environment.ts";

const destination = provider(cc3Rpc);
try {
  await requireTestnet(destination, 102031n);
  const selected = await heldAssignmentProof(destination);
  process.stdout.write(
    JSON.stringify({
      evidenceKind: "live-read-verified",
      signingEnabled: false,
      proofPath: selected.record.proofPath,
      proofHash: selected.record.proofHash,
      nativeBlock: selected.native.blockNumber,
      nativeBlockHash: selected.native.blockHash,
      nativeTransactionIndex: selected.native.provenTxIndex.toString(),
      submittedToMarket: false,
    }) + "\n",
  );
} catch (error: unknown) {
  process.stderr.write(errorSummary(error) + "\n");
  process.exitCode = 1;
} finally {
  destination.destroy();
}
