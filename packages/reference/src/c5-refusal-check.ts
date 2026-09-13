import { isError } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { EvidenceError } from "./checker-rpc.ts";
import { record, string, number } from "./evidence-files.ts";
import { canonicalJson } from "./canonical-json.ts";
import { c5Actors, c5ReferenceTerms } from "./c5-policy.ts";
import { referenceIdentity } from "./index.ts";
import { applicationInterfaces, applicationPins } from "./manifest-chain.ts";
import { c5CanonicalBlock, c5Read, c5ReadMarket, c5ReadSource } from "./c5-chain.ts";
import { checkC5Proof } from "./c5-proof-check.ts";
import { c5MarketState } from "./c5-market-check.ts";

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new EvidenceError("C5 refusal array missing");
  return value as unknown[];
}

export async function checkC5Refusal(
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
  entry: Record<string, unknown>,
  journal: readonly Record<string, unknown>[],
  claimId: string,
) {
  if (
    entry.transactionHash !== null ||
    entry.evidenceType !== "eth_call" ||
    entry.caller !== c5Actors.payer ||
    entry.destinationMarket !== applicationPins.market.address
  )
    throw new EvidenceError("C5 refusal must be read-only from its declared caller and market");
  const blocks = record(entry.blocks),
    sourceBlock = record(blocks.source),
    destinationBlock = record(blocks.destination);
  const sourceHeight = number(sourceBlock.number),
    destinationHeight = number(destinationBlock.number);
  const proofs = list(entry.proofs).map(record);
  if (proofs.length !== 3)
    throw new EvidenceError("C5 refusal requires three exact event identities");
  const verified = [];
  for (const [index, event] of (["cancel", "reserve", "assign"] as const).entries()) {
    const item = proofs[index];
    if (!item) throw new EvidenceError("C5 refusal proof missing");
    const original = journal.find(
      (row) =>
        row.state === "native-verified" &&
        row.proofPath === item.proofPath &&
        row.proofHash === item.proofHash,
    );
    if (!original) throw new EvidenceError("C5 refusal proof lacks archive anchor");
    verified.push(
      await checkC5Proof(
        source,
        destination,
        original,
        claimId,
        index === 0 ? "1" : "2",
        event,
        destinationHeight,
      ),
    );
  }
  const cancel = verified[0];
  if (!cancel) throw new EvidenceError("C5 cancellation proof unavailable");
  const saleIds = ["1", "2"].map(
    (round) => referenceIdentity(c5ReferenceTerms(claimId, round)).saleId,
  );
  const calldata = applicationInterfaces.market.encodeFunctionData("recognizeCancellation", [
    cancel.envelope,
    cancel.receiptLocalLogIndex,
    saleIds[1],
  ]);
  const native = record(entry.native),
    nativeCall = record(native.verification);
  if (
    calldata !== entry.calldata ||
    nativeCall.calldata !== cancel.nativeCalldata ||
    nativeCall.raw !== cancel.nativeRaw ||
    native.blockNumber !== destinationHeight ||
    native.blockHash !== destinationBlock.hash
  )
    throw new EvidenceError(
      "C5 native and application refusal did not use identical authenticated bytes and block",
    );
  const keys = verified.map((proof) => proof.eventKey);
  const [sourceState, market] = await Promise.all([
    c5ReadSource(source, claimId, sourceHeight),
    c5ReadMarket(destination, saleIds, keys, destinationHeight),
  ]);
  const state = c5MarketState(market, claimId, keys);
  if (
    sourceState.blockHash !== sourceBlock.hash ||
    market.blockHash !== destinationBlock.hash ||
    sourceState.rounds[0]?.state !== 3n ||
    sourceState.rounds[1]?.state !== 2n ||
    sourceState.claim?.currentBeneficiary !== c5Actors.buyer ||
    !sourceState.claim.successfulSale ||
    sourceState.claim.redeemed ||
    sourceState.claim.activeRound !== 0n ||
    sourceState.backing < 10000000n ||
    sourceState.balance < sourceState.backing ||
    state.saleState !== 1n ||
    state.bound < 9410000n ||
    keys.some((key, index) => state.consumed[key] !== (index === 1))
  )
    throw new EvidenceError(
      "C5 refusal did not target a later BOUND assigned round of the same claim",
    );
  for (const [index, round] of sourceState.rounds.entries()) {
    const identity = referenceIdentity(c5ReferenceTerms(claimId, String(index + 1)));
    if (
      round?.encodedTerms !== identity.encodedTerms ||
      round.saleId !== identity.saleId ||
      round.termsHash !== identity.termsHash
    )
      throw new EvidenceError("C5 refusal retained round identity mismatch");
  }
  const before = record(entry.before),
    after = record(entry.after);
  if (canonicalJson(before) !== canonicalJson(after))
    throw new EvidenceError("C5 refused call changed recorded snapshots");
  const recordedSource = record(before.source);
  if (
    recordedSource.claimRaw !== sourceState.raw.claim ||
    recordedSource.backingRaw !== sourceState.raw.backing ||
    canonicalJson(recordedSource.roundRaw) !== canonicalJson(sourceState.raw.rounds)
  )
    throw new EvidenceError("C5 refusal source raw records differ from public history");
  const sourceBalances = await Promise.all(
    [...Object.values(c5Actors), applicationPins.vault.address].map((actor) =>
      c5Read(source, "sourceToken", "balanceOf", [actor], sourceHeight),
    ),
  );
  const allowance = await c5Read(
    source,
    "sourceToken",
    "allowance",
    [c5Actors.payer, applicationPins.vault.address],
    sourceHeight,
  );
  if (
    canonicalJson(recordedSource.balancesRaw) !==
      canonicalJson(sourceBalances.map((item) => item.raw)) ||
    recordedSource.allowanceRaw !== allowance.raw
  )
    throw new EvidenceError("C5 refusal source token records differ from public history");
  for (const [field, methods] of [
    ["sales", ["getSale"]],
    ["consumption", ["consumed"]],
    ["totals", ["totalBound", "totalCredits", "totalLiabilities"]],
    ["balances", ["balanceOf"]],
    ["credits", ["credits"]],
  ] as const) {
    const raw = market.reads
      .filter((item) => methods.some((method) => method === item.method))
      .map((item) => item.raw);
    if (canonicalJson(list(before[field]).map((item) => record(item).raw)) !== canonicalJson(raw))
      throw new EvidenceError(`C5 refusal ${field} raw snapshot mismatch`);
  }
  let rejection: string | null = null;
  try {
    await destination.call({
      to: applicationPins.market.address,
      from: c5Actors.payer,
      data: calldata,
      blockTag: destinationHeight,
    });
  } catch (error: unknown) {
    if (!isError(error, "CALL_EXCEPTION") || !error.data) throw error;
    rejection = error.data;
  }
  if (
    rejection !== string(record(entry.result).revertData) ||
    applicationInterfaces.market.parseError(rejection)?.name !== "SaleIdMismatch"
  )
    throw new EvidenceError(
      "C5 historical application refusal differs from recorded semantic rejection",
    );
  await Promise.all([
    c5CanonicalBlock(source, sourceHeight, string(sourceBlock.hash)),
    c5CanonicalBlock(destination, destinationHeight, string(destinationBlock.hash)),
  ]);
  return {
    evidenceKind: "historical-replay",
    transactionHash: null,
    sameNativeProofBytes: true,
    rejection,
    error: "SaleIdMismatch",
    sourceState,
    market,
    proofs: verified,
  };
}
