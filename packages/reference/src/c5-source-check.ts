import { isDeepStrictEqual } from "node:util";
import { ZeroHash } from "ethers";
import type { JsonRpcProvider, TransactionReceipt, TransactionResponse } from "ethers";
import { EvidenceError } from "./checker-rpc.ts";
import { c5ReferenceTerms, c5Actors } from "./c5-policy.ts";
import { referenceIdentity } from "./index.ts";
import { applicationPins } from "./manifest-chain.ts";
import { checkC5SourceEvent } from "./c5-source-event.ts";
import { c5ReadSource, c5IsolatedTransaction } from "./c5-chain.ts";
import type { SourceClaimState } from "./source-state.ts";

type Snapshot = Awaited<ReturnType<typeof c5ReadSource>>;

export function assertC5SourceHistory(
  action: string,
  claimId: string,
  sender: string,
  before: Snapshot,
  after: Snapshot,
) {
  const round = action.startsWith("c5-r2-") ? "2" : "1";
  const terms = c5ReferenceTerms(claimId, round);
  const identity = referenceIdentity(terms);
  const timestamp = after.timestamp;
  const face = 10000000n;
  const claim = before.claim;
  let expected: SourceClaimState;
  let movement = 0n;
  const rounds = [...before.rounds];
  const index = round === "1" ? 0 : 1;
  if (action === "c5-create") {
    if (
      claim ||
      before.rounds.some(Boolean) ||
      sender !== c5Actors.payer ||
      timestamp > 1789290000n ||
      before.nextClaimId !== BigInt(claimId)
    )
      throw new EvidenceError("C5 creation identity, sender or launch deadline mismatch");
    expected = {
      token: applicationPins.sourceToken.address,
      face,
      maturity: 1789306200n,
      originalBeneficiary: c5Actors.seller,
      currentBeneficiary: c5Actors.seller,
      activeRound: 0n,
      latestRound: 0n,
      successfulSale: false,
      redeemed: false,
      referenceHash: ZeroHash,
    };
    movement = face;
  } else {
    if (
      !claim ||
      claim.redeemed ||
      claim.token !== terms.sourceToken ||
      claim.face !== face ||
      claim.maturity !== 1789306200n ||
      claim.originalBeneficiary !== c5Actors.seller ||
      claim.referenceHash !== ZeroHash
    )
      throw new EvidenceError("C5 source immutable claim mismatch");
    expected = { ...claim };
    const committed = (state: bigint) => ({
      state,
      encodedTerms: identity.encodedTerms,
      saleId: identity.saleId,
      termsHash: identity.termsHash,
    });
    if (action.endsWith("-reserve")) {
      if (
        sender !== c5Actors.seller ||
        claim.currentBeneficiary !== c5Actors.seller ||
        claim.successfulSale ||
        claim.activeRound !== 0n ||
        claim.latestRound + 1n !== BigInt(round) ||
        rounds[index] !== null ||
        timestamp > (round === "1" ? 1789290000n : 1789296300n) ||
        (round === "2" && rounds[0]?.state !== 3n)
      )
        throw new EvidenceError(
          "C5 reservation lacked correct retained cancellation or launch eligibility",
        );
      expected = { ...claim, activeRound: BigInt(round), latestRound: BigInt(round) };
      rounds[index] = committed(1n);
    } else if (action.endsWith("-assign") || action.endsWith("-cancel")) {
      if (
        !isDeepStrictEqual(rounds[index], committed(1n)) ||
        claim.activeRound !== BigInt(round) ||
        claim.successfulSale ||
        claim.currentBeneficiary !== c5Actors.seller ||
        claim.latestRound !== BigInt(round)
      )
        throw new EvidenceError("C5 source outcome lacks exact active reservation");
      if (action.endsWith("-assign")) {
        if (round !== "2" || sender !== c5Actors.seller || timestamp >= 1789301700n)
          throw new EvidenceError("C5 assignment actor, round or deadline mismatch");
        expected = {
          ...claim,
          activeRound: 0n,
          successfulSale: true,
          currentBeneficiary: c5Actors.buyer,
        };
        rounds[index] = committed(2n);
      } else {
        if (timestamp < BigInt(round === "1" ? "1789295400" : "1789301700"))
          throw new EvidenceError("C5 source cancellation was early");
        expected = { ...claim, activeRound: 0n };
        rounds[index] = committed(3n);
      }
    } else if (action === "c5-redeem") {
      if (
        timestamp < 1789306200n ||
        claim.activeRound !== 0n ||
        claim.currentBeneficiary !== (claim.successfulSale ? c5Actors.buyer : c5Actors.seller)
      )
        throw new EvidenceError("C5 redemption timing or beneficiary mismatch");
      expected = { ...claim, redeemed: true };
      movement = -face;
    } else throw new EvidenceError("Unsupported C5 source operation");
  }
  if (
    !isDeepStrictEqual(after.claim, expected) ||
    !isDeepStrictEqual(after.rounds, rounds) ||
    after.backing !== before.backing + movement ||
    after.nextClaimId !== before.nextClaimId + (action === "c5-create" ? 1n : 0n) ||
    before.balance < before.backing ||
    after.balance < after.backing
  )
    throw new EvidenceError("C5 source state, retained round or backing transition mismatch");
  return {
    action,
    claimId,
    round: action === "c5-create" || action === "c5-redeem" ? null : round,
    movement,
  };
}

export async function checkC5Source(
  rpc: JsonRpcProvider,
  action: string,
  claimId: string,
  transaction: TransactionResponse,
  receipt: TransactionReceipt,
) {
  await c5IsolatedTransaction(rpc, receipt, applicationPins.vault.address);
  const [before, after] = await Promise.all([
    c5ReadSource(rpc, claimId, receipt.blockNumber - 1, action === "c5-create"),
    c5ReadSource(rpc, claimId, receipt.blockNumber),
  ]);
  const transition = assertC5SourceHistory(action, claimId, transaction.from, before, after);
  const logs = receipt.logs.filter((log) => log.address === applicationPins.vault.address);
  const log = logs[0];
  if (logs.length !== 1 || !log || log.removed)
    throw new EvidenceError("C5 source event absent or ambiguous");
  const event = checkC5SourceEvent(
    action,
    claimId,
    before.claim?.currentBeneficiary ?? c5Actors.seller,
    log,
  );
  return {
    ...transition,
    before,
    after,
    event,
    payment:
      action === "c5-create"
        ? { from: c5Actors.payer, to: applicationPins.vault.address, amount: 10000000n }
        : action === "c5-redeem"
          ? {
              from: applicationPins.vault.address,
              to: before.claim?.currentBeneficiary ?? "",
              amount: 10000000n,
            }
          : null,
  };
}
