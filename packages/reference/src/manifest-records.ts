import { readFile, readdir } from "node:fs/promises";
import { root, EvidenceError } from "./checker-rpc.ts";
import { artifactReference, record, string, number, storeEvidence } from "./evidence-files.ts";
import type {
  CampaignManifest,
  DeploymentEvidence,
  ProofEvidence,
  TransactionEvidence,
} from "./manifest-types.ts";

export async function campaignJournal(name: CampaignManifest["campaignId"]) {
  const lines = (await readFile(`${root}evidence/campaign/actions.jsonl`, "utf8"))
    .split("\n")
    .filter(Boolean);
  return lines
    .map((line) => record(JSON.parse(line) as unknown))
    .filter((row) => {
      const action = string(row.action);
      return (
        action.startsWith(`${name}-`) ||
        ["approve-source", "supply-buyer", "approve-settlement"].includes(action) ||
        (name === "a" &&
          ["withdraw-fee", "wrong-sale-proof", "assigned-cancel-refusal"].includes(action))
      );
    });
}

export async function deploymentEvidence(): Promise<readonly DeploymentEvidence[]> {
  const raw = record(
    JSON.parse(
      await readFile(`${root}deployments/custody/provenance-1789252172280.json`, "utf8"),
    ) as unknown,
  );
  if (!Array.isArray(raw.deployments)) throw new EvidenceError("No custody provenance deployments");
  return await Promise.all(
    raw.deployments.map(async (item: unknown) => {
      const entry = record(item);
      const role =
        entry.action === "source-token"
          ? "sourceToken"
          : entry.action === "settlement-token"
            ? "settlementToken"
            : entry.action;
      if (
        role !== "sourceToken" &&
        role !== "settlementToken" &&
        role !== "vault" &&
        role !== "market"
      )
        throw new EvidenceError("Unknown custody deployment role");
      if (!Array.isArray(entry.constructorArguments))
        throw new EvidenceError("Missing constructor arguments");
      return {
        role,
        chainId: string(entry.chainId),
        address: string(entry.address),
        transactionHash: string(entry.transactionHash),
        runtimeCodeHash: string(entry.runtimeCodeHash),
        constructorArguments: entry.constructorArguments.map((arg: unknown) =>
          typeof arg === "number" ? number(arg) : string(arg),
        ),
        artifact: await artifactReference(string(entry.artifactPath)),
      };
    }),
  );
}

export async function transactionEvidence(
  rows: readonly Record<string, unknown>[],
): Promise<readonly TransactionEvidence[]> {
  return await Promise.all(
    rows
      .filter((row) => row.state === "mined" || row.state === "reverted")
      .map(async (row) => {
        const receipt = record(row.receipt);
        return {
          action: string(row.action),
          chainId: string(row.chainId),
          transactionHash: string(row.transactionHash),
          blockNumber: number(receipt.blockNumber),
          blockHash: string(receipt.blockHash),
          receiptStatus: number(receipt.status),
          observedAt: string(row.observedAt),
          receipt: await storeEvidence(receipt),
        };
      }),
  );
}

export async function proofEvidence(
  rows: readonly Record<string, unknown>[],
): Promise<readonly ProofEvidence[]> {
  return await Promise.all(
    rows
      .filter((row) => row.state === "native-verified")
      .map(async (row) => {
        const native = record(row.native);
        const action = string(row.action);
        const name = action.endsWith("-reserve-proof")
          ? "SaleReserved"
          : action.endsWith("-assign-proof")
            ? "SaleAssigned"
            : "SaleCancelled";
        const source = rows.find(
          (entry) => entry.state === "mined" && entry.transactionHash === row.sourceTransactionHash,
        );
        if (!source) throw new EvidenceError("Proof lacks corresponding source receipt");
        const terms = record(source.terms);
        const artifact = await artifactReference(string(row.proofPath));
        if (artifact.sha256 !== row.proofHash)
          throw new EvidenceError("Archived proof hash differs from native record");
        return {
          sourceTransactionHash: string(row.sourceTransactionHash),
          sourceBlock: number(row.sourceBlock),
          receiptLocalLogIndex: number(row.receiptLocalLogIndex),
          nativeTransactionIndex: string(native.provenTxIndex),
          eventKey: string(row.eventKey),
          nativeVerified: true,
          observedAt: string(row.observedAt),
          artifact,
          decodedEvent: {
            name,
            saleId: string(row.saleId),
            claimId: string(terms.claimId),
            round: string(terms.round),
            termsHash: string(row.termsHash),
          },
        };
      }),
  );
}

export async function latestIndependentCheck(transactionHash: string) {
  const files = (await readdir(`${root}evidence/independent`))
    .filter(
      (file) => file.startsWith(`funding-${transactionHash.slice(2)}-`) && file.endsWith(".json"),
    )
    .sort();
  const latest = files.at(-1);
  return latest ? await artifactReference(`evidence/independent/${latest}`) : null;
}
