import type { JsonRpcProvider } from "ethers";
import { submissionContext } from "./submission-context.ts";
import { submissionInfrastructure } from "./submission-infrastructure.ts";
import { submissionCheck, submissionReport, SubmissionUnverified } from "./submission-report.ts";
import type {
  SubmissionCheck,
  SubmissionLabel,
  SubmissionObservation,
} from "./submission-report.ts";
import { checkSubmissionFinality } from "./submission-history.ts";
import { checkSubmissionCancellation, checkSubmissionWrongSale } from "./submission-refusal.ts";
import { checkSubmissionLateCancellation } from "./submission-late-cancel.ts";
import { EvidenceError } from "./checker-rpc.ts";
import { submissionC5Observation } from "./submission-c5.ts";

export async function verifySubmission(
  path: string,
  source: JsonRpcProvider,
  destination: JsonRpcProvider,
) {
  const context = submissionContext(path, source, destination);
  const checks: SubmissionCheck[] = [];
  const add = async (
    id: string,
    name: string,
    label: SubmissionLabel,
    operation: () => Promise<SubmissionObservation>,
  ) => {
    checks.push(await submissionCheck(id, name, label, operation));
  };
  await submissionInfrastructure(add, context, source, destination);
  await add(
    "a-face",
    "Claim A: face value read from source chain",
    "live-read-verified",
    async () => {
      const value = await context.source();
      return { detail: `${value.faceRaw.toString()} raw source-token units`, evidence: value };
    },
  );
  await add(
    "a-funding",
    "Claim A: buyer funding read from chain",
    "historical-replay",
    async () => {
      const value = (await context.payments()).funding;
      return {
        detail: `${value.amountRaw.toString()} raw settlement-token units; ${value.transactionHash}`,
        evidence: value,
      };
    },
  );
  await add(
    "a-finality",
    "Claim A: CC3 funding precedes Sepolia assignment and is finalized",
    "live-read-verified",
    async () => checkSubmissionFinality((await context.claim()).manifest, source, destination),
  );
  await add(
    "a-proof",
    "Claim A: SaleAssigned proof accepted at recorded CC3 block",
    "historical-replay",
    async () => {
      const { manifest, verified } = await context.claim();
      const hashes = manifest.proofs
        .filter((proof) => proof.decodedEvent.name === "SaleAssigned")
        .map((proof) => proof.artifact.sha256);
      const proofs = verified.proofChecks.filter(
        (check) =>
          hashes.includes(check.artifact.sha256) &&
          check.historical.basis !== "reconstructed-observation-time-not-original-call-block",
      );
      if (!proofs.length)
        throw new SubmissionUnverified("No recorded CC3 verification block for assignment proof");
      if (proofs.some((proof) => !proof.historical.accepted))
        throw new EvidenceError("Recorded native assignment proof rejected");
      return {
        detail: `Accepted at recorded blocks ${proofs.map((proof) => proof.historical.blockNumber.toString()).join(", ")}; not current continuity validity`,
        evidence: proofs,
      };
    },
  );
  await add(
    "a-identity",
    "Claim A: saleId, termsHash and round independently recomputed",
    "live-read-verified",
    async () => {
      const value = await context.source();
      await context.market();
      return {
        detail: `Round ${value.round.toString()}; saleId ${value.saleId}; termsHash ${value.termsHash}`,
        evidence: value,
      };
    },
  );
  for (const [key, name] of [
    ["sellerWithdrawal", "seller"],
    ["feeWithdrawal", "fee"],
  ] as const)
    await add(
      `a-withdraw-${name}`,
      `Claim A: ${name} withdrawal matches recorded amount`,
      "historical-replay",
      async () => {
        const value = (await context.payments())[key];
        return {
          detail: `${value.amountRaw.toString()} raw settlement-token units to ${value.to}`,
          evidence: value,
        };
      },
    );
  await add(
    "a-beneficiary",
    "Claim A: current beneficiary is buyer",
    "live-read-verified",
    async () => {
      const value = await context.source();
      return {
        detail: `${value.buyer} at source block ${value.blockNumber.toString()}`,
        evidence: value,
      };
    },
  );
  await add(
    "wrong-sale",
    "Authentic wrong-sale proof returns SaleIdMismatch",
    "historical-replay",
    async () => {
      const value = await context.claim();
      return checkSubmissionWrongSale(value.manifest, value.timeline, destination);
    },
  );
  await add(
    "assigned-cancel",
    "Cancelling an assigned round is refused",
    "historical-replay",
    async () => {
      const value = await context.claim();
      return checkSubmissionCancellation(value.manifest, value.timeline, source);
    },
  );
  await add(
    "late-cancel",
    "Late cancellation with assignment proof held back is refused",
    "historical-replay",
    async () => {
      const value = await context.claim();
      return checkSubmissionLateCancellation(
        value.manifest,
        value.timeline,
        value.verified,
        source,
        destination,
      );
    },
  );
  await add(
    "liabilities",
    "Market liabilities equal credits plus bound funds",
    "live-read-verified",
    async () => {
      const value = await context.market();
      return {
        detail: `${value.liabilities.toString()} = ${value.credits.toString()} + ${value.bound.toString()} raw settlement-token units`,
        evidence: value,
      };
    },
  );
  for (const [id, name] of [
    ["c5-r2-fund", "funding"],
    ["c5-r2-assign", "assignment"],
    ["c5-refusal", "old-round proof refusal"],
    ["c5-r2-settle", "settlement"],
    ["c5-withdraw-seller", "seller withdrawal"],
    ["c5-withdraw-fee", "fee withdrawal"],
    ["c5-redeem", "source redemption"],
  ] as const)
    await add(id, `Claim C: ${name}`, "historical-replay", async () => {
      const attempt = (await context.release()).campaigns.c5;
      return submissionC5Observation(attempt, id);
    });
  return {
    generatedAt: new Date().toISOString(),
    scope: "Requested on-chain submission checks; not an audit or organizer acceptance",
    candidatePath: path,
    release: await context.releaseAttempt(),
    ...submissionReport(checks),
  };
}
