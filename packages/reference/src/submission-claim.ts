import type { JsonRpcProvider } from "ethers";
import { EvidenceError } from "./checker-rpc.ts";
import { SubmissionUnverified } from "./submission-report.ts";
import { record, string } from "./evidence-files.ts";
import { referenceEconomics } from "./index.ts";
import { readSourceHistory } from "./source-history-read.ts";
import { readMarketHistory } from "./market-history-read.ts";
import type { CampaignManifest } from "./manifest-types.ts";
import type { SourceState } from "./source-state.ts";
import type { MarketTransitionState } from "./market-transition.ts";
import { checkSubmissionClaimPayments, submissionClaimTerms } from "./submission-claim-payments.ts";
import type { SubmissionVerification } from "./submission-claim-payments.ts";
export { checkSubmissionClaimPayments, submissionPayment } from "./submission-claim-payments.ts";
export type { SubmissionVerification } from "./submission-claim-payments.ts";

export function assertSubmissionClaimSource(manifest: CampaignManifest, state: SourceState) {
  const terms = submissionClaimTerms(manifest),
    claim = state.claim,
    round = state.round;
  if (!claim || !round)
    throw new SubmissionUnverified("Submission source claim or round unavailable");
  if (
    claim.face !== BigInt(string(terms.sourceFaceValueRaw)) ||
    claim.token !== terms.sourceToken ||
    claim.maturity !== BigInt(string(terms.maturity))
  )
    throw new EvidenceError("Submission source face, token or maturity mismatch");
  if (
    claim.currentBeneficiary !== terms.buyer ||
    claim.originalBeneficiary !== terms.seller ||
    !claim.successfulSale ||
    !claim.redeemed ||
    claim.activeRound !== 0n ||
    claim.latestRound !== BigInt(string(terms.round))
  )
    throw new EvidenceError("Submission source beneficiary or terminal claim state mismatch");
  if (
    round.state !== 2n ||
    round.encodedTerms !== manifest.identity.encodedTerms ||
    round.saleId !== manifest.identity.saleId ||
    round.termsHash !== manifest.identity.termsHash
  )
    throw new EvidenceError("Submission source round identity mismatch");
  return {
    faceRaw: claim.face,
    buyer: claim.currentBeneficiary,
    round: claim.latestRound,
    saleId: round.saleId,
    termsHash: round.termsHash,
    claim,
    sourceRound: round,
  };
}

export function assertSubmissionClaimMarket(
  manifest: CampaignManifest,
  state: MarketTransitionState,
) {
  const terms = submissionClaimTerms(manifest);
  if (state.saleState !== 2n || state.encodedTerms !== manifest.identity.encodedTerms)
    throw new EvidenceError("Submission destination sale state or canonical terms mismatch");
  if (state.liabilities !== state.bound + state.credits || state.balance < state.liabilities)
    throw new EvidenceError("Submission market liabilities or token coverage mismatch");
  return {
    ...state,
    ...referenceEconomics(string(terms.grossPurchasePriceRaw), string(terms.feeBps)),
    saleId: manifest.identity.saleId,
    round: terms.round,
  };
}

async function currentRead<T>(
  rpc: JsonRpcProvider,
  chainId: bigint,
  read: (block: number) => Promise<T>,
) {
  if ((await rpc.getNetwork()).chainId !== chainId)
    throw new EvidenceError("Submission RPC chain mismatch");
  const block = await rpc.getBlock("latest");
  if (!block?.hash) throw new SubmissionUnverified("Submission current block unavailable");
  const result = await read(block.number);
  const canonical = record(
    await rpc.send("eth_getBlockByNumber", [`0x${block.number.toString(16)}`, false]),
  );
  if (canonical.hash !== block.hash)
    throw new EvidenceError("Submission current block is not canonical");
  return {
    observedAt: new Date().toISOString(),
    blockNumber: block.number,
    blockHash: block.hash,
    timestamp: block.timestamp,
    ...result,
  };
}

export async function checkSubmissionClaimSource(
  manifest: CampaignManifest,
  source: JsonRpcProvider,
) {
  submissionClaimTerms(manifest);
  return currentRead(source, 11155111n, async (block) => {
    const observed = await readSourceHistory(source, manifest, block, false);
    if (observed.accounting.balance < observed.accounting.backing)
      throw new EvidenceError("Submission source backing is uncovered");
    return {
      ...assertSubmissionClaimSource(manifest, observed.state),
      reads: observed.reads,
      accounting: observed.accounting,
    };
  });
}

export async function checkSubmissionClaimMarket(
  manifest: CampaignManifest,
  destination: JsonRpcProvider,
) {
  submissionClaimTerms(manifest);
  return currentRead(destination, 102031n, async (block) => {
    const observed = await readMarketHistory(destination, manifest, block);
    return { ...assertSubmissionClaimMarket(manifest, observed.state), reads: observed.reads };
  });
}

export async function getSubmissionClaimChecks(
  manifest: CampaignManifest,
  verified: SubmissionVerification,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const [sourceCheck, market, payments] = await Promise.all([
    checkSubmissionClaimSource(manifest, source),
    checkSubmissionClaimMarket(manifest, destination),
    checkSubmissionClaimPayments(manifest, verified),
  ]);
  return { source: sourceCheck, market, payments };
}
