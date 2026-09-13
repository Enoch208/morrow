import type { JsonRpcProvider } from "ethers";
import { createHash } from "node:crypto";
import { EvidenceError, integer, interfaces, tuple } from "./checker-rpc.ts";
import { readPublicArtifact, record, string } from "./evidence-files.ts";
import { c5CallPolicy, c5Transaction, c5Payments } from "./c5-receipts.ts";
import { c5ReferenceTerms, c5StageStatus, c5JournalIntents } from "./c5-policy.ts";
import { referenceIdentity } from "./index.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { checkC5Source } from "./c5-source-check.ts";
import { checkC5Market } from "./c5-market-check.ts";
import { checkC5Proof, c5NativeMethod } from "./c5-proof-check.ts";
import { checkC5Refusal } from "./c5-refusal-check.ts";
import { c5Read, c5ReadSource, c5CheckPins } from "./c5-chain.ts";

export async function verifyC5(source: JsonRpcProvider, destination: JsonRpcProvider) {
  const bytes = await readPublicArtifact("evidence/c5/actions.jsonl");
  const lines = bytes.toString("utf8").split("\n").filter(Boolean);
  if (lines.length > 10000) throw new EvidenceError("C5 journal exceeds bounded campaign size");
  const journal = lines.map((line) => record(JSON.parse(line) as unknown));
  const intents = c5JournalIntents(journal);
  const creation = journal.filter(
    (entry) => entry.action === "c5-create" && entry.state === "mined",
  );
  if (creation.length !== 1)
    throw new EvidenceError("C5 journal lacks one actual creation receipt");
  const creationHash = string(creation[0]?.transactionHash);
  const creationReceipt = await source.getTransactionReceipt(creationHash);
  const matches =
    creationReceipt?.logs.filter(
      (log) =>
        log.address === applicationPins.vault.address &&
        log.topics[0] === applicationInterfaces.vault.getEvent("ClaimFunded")?.topicHash,
    ) ?? [];
  const event = matches[0] ? applicationInterfaces.vault.parseLog(matches[0]) : null;
  if (creationReceipt?.status !== 1 || matches.length !== 1 || !event)
    throw new EvidenceError("C5 actual claim creation event missing");
  const claimId = integer(event.args[0]).toString();
  const terms = [c5ReferenceTerms(claimId, "1"), c5ReferenceTerms(claimId, "2")];
  const verified = new Set<string>();
  const proofEntries = new Map<string, Record<string, unknown>>();
  for (const entry of journal.filter(
    (row) => row.state === "native-verified" && row.action !== "c5-integration-readiness",
  ))
    proofEntries.set(string(entry.proofHash), entry);
  const proofs = [];
  for (const entry of proofEntries.values()) {
    const action = string(entry.action),
      match = /^c5-r([12])-(reserve|assign|cancel)-proof$/.exec(action);
    if (!match?.[1] || !match[2]) throw new EvidenceError("C5 proof journal action mismatch");
    const kind = match[2];
    if (kind !== "reserve" && kind !== "assign" && kind !== "cancel")
      throw new EvidenceError("C5 proof kind unsupported");
    proofs.push({
      entry,
      result: await checkC5Proof(source, destination, entry, claimId, match[1], kind),
    });
    verified.add(action);
  }
  const transactions: {
    action: string;
    transactionHash: string;
    blockNumber: number;
    blockHash: string;
    transaction: unknown;
    receipt: unknown;
    state: unknown;
    payments: Awaited<ReturnType<typeof c5Payments>>;
  }[] = [];
  for (const entry of journal.filter((row) => row.state === "mined")) {
    const action = string(entry.action),
      hash = string(entry.transactionHash);
    if (verified.has(action)) throw new EvidenceError("Duplicate C5 mined action in journal");
    const policy = c5CallPolicy(action, claimId);
    const side = applicationPins[policy.role].chainId === "11155111" ? "source" : "destination";
    const rpc = side === "source" ? source : destination;
    const actual = await c5Transaction(rpc, action, hash, claimId);
    if (
      entry.chainId !== actual.transaction.chainId.toString() ||
      entry.sender !== actual.transaction.from
    )
      throw new EvidenceError("C5 journal transaction domain or actor mismatch");
    let state;
    let payment = null;
    if (policy.role === "vault") {
      state = await checkC5Source(source, action, claimId, actual.transaction, actual.receipt);
      payment = state.payment;
    } else if (policy.role === "market") {
      let selected = null;
      if (policy.method !== "withdraw") {
        const calldata = interfaces.native.encodeFunctionData(
          c5NativeMethod,
          tuple(actual.call.args[0]).toArray(),
        );
        const found = proofs.find((proof) => proof.result.nativeCalldata === calldata);
        if (!found)
          throw new EvidenceError(
            "C5 mined application proof has no matching authenticated archive",
          );
        selected = await checkC5Proof(
          source,
          destination,
          found.entry,
          claimId,
          "2",
          action.endsWith("-fund") ? "reserve" : action.endsWith("-settle") ? "assign" : "cancel",
          actual.receipt.blockNumber,
        );
      }
      state = await checkC5Market(
        destination,
        action,
        claimId,
        actual,
        selected,
        proofs.map((proof) => proof.result.eventKey),
      );
      payment = state.payment;
    } else {
      const allowance = await c5Read(
        rpc,
        policy.role,
        "allowance",
        [actual.transaction.from, string(policy.args[0])],
        actual.receipt.blockNumber,
      );
      if (integer(allowance.decoded[0]) !== BigInt(string(policy.args[1])))
        throw new EvidenceError("C5 approval did not create exact allowance");
      state = { allowance };
    }
    const payments = await c5Payments(rpc, side, actual.receipt, payment);
    const rawTransaction: unknown = actual.transaction.toJSON(),
      rawReceipt: unknown = actual.receipt.toJSON();
    transactions.push({
      action,
      transactionHash: hash,
      blockNumber: actual.receipt.blockNumber,
      blockHash: actual.receipt.blockHash,
      transaction: rawTransaction,
      receipt: rawReceipt,
      state,
      payments,
    });
    verified.add(action);
  }
  const refusal = journal
    .filter((entry) => entry.action === "c5-refusal" && entry.state === "refusal-verified")
    .at(-1);
  const refusalResult = refusal
    ? await checkC5Refusal(source, destination, refusal, journal, claimId)
    : null;
  if (refusalResult) verified.add("c5-refusal");
  const pending = intents.filter(
    (intent) =>
      !transactions.some(
        (transaction) =>
          transaction.action === intent.action &&
          transaction.transactionHash === intent.transactionHash,
      ),
  );
  const latest = await source.getBlock("latest");
  if (!latest?.hash) throw new EvidenceError("C5 current source snapshot unavailable");
  await c5CheckPins(source, "source", latest.number);
  const currentSource = await c5ReadSource(source, claimId, latest.number);
  return {
    schemaVersion: 1,
    campaignId: "c5",
    reportKind: "incremental-independent-check",
    generatedAt: new Date().toISOString(),
    ...c5StageStatus(verified, pending.length),
    claimId,
    journal: {
      path: "evidence/c5/actions.jsonl",
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    terms: terms.map((value) => ({ ...value, identity: referenceIdentity(value) })),
    transactions,
    proofs: proofs.map((proof) => proof.result),
    refusal: refusalResult,
    pending,
    currentSource,
    unresolvedFacts: [
      "This incremental C5 report is not a schema-validated full release manifest or fresh-environment release verification",
      "Historical seller preflight/finality observation timing is not independently certified by this report",
    ],
  };
}
