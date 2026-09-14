import type { ProofEnvelope, ProofProgress, SaleTerms } from "@morrow/protocol";
import type { BrowserActionContext, BrowserActionOptions } from "./browser-action-context.ts";
import { withBrowserAction } from "./browser-action-context.ts";
import { assertBrowserTerms } from "./browser-action-policy.ts";
import { canonicalSourceReceipt, verifySaleEnvelope } from "./sale-proof-validation.ts";
import type { SaleProofEvent } from "./sale-proof-validation.ts";
import { obtainProof } from "./proof.ts";
import { readNative } from "./native.ts";
import { decodedHash } from "./decoded-state.ts";
import { ConfigurationError } from "./errors.ts";

export interface BrowserProofInput {
  readonly proof: ProofEnvelope;
  readonly sourceTransactionHash: string;
}

export async function verifyBrowserProof(
  context: BrowserActionContext,
  input: BrowserProofInput,
  terms: SaleTerms,
  event: SaleProofEvent,
) {
  const receipt = await canonicalSourceReceipt(context.source, input.sourceTransactionHash);
  return verifySaleEnvelope(
    context.source,
    context.destination,
    input.proof,
    receipt,
    terms,
    event,
  );
}

export async function prepareBrowserSaleProof(
  terms: SaleTerms,
  sourceTransactionHash: string,
  event: SaleProofEvent,
  options: BrowserActionOptions & { readonly proverUrl: string },
  progress?: (state: ProofProgress) => void,
) {
  assertBrowserTerms(terms);
  if (!["reserve", "assign", "cancel"].includes(event))
    throw new ConfigurationError("Unsupported source proof event");
  const transactionHash = decodedHash(sourceTransactionHash);
  return withBrowserAction(options, async (context) => {
    const receipt = await canonicalSourceReceipt(context.source, transactionHash);
    const finalized = await context.source.getBlock("finalized");
    if (!finalized || receipt.blockNumber > finalized.number) {
      progress?.({ phase: "awaiting-finality", sourceBlock: receipt.blockNumber });
      throw new ConfigurationError("Source transaction is awaiting finality");
    }
    const attested = await readNative(context.destination, "chainInfo", "is_height_attested", [
      1n,
      receipt.blockNumber,
    ]);
    if (attested.decoded[0] !== true) {
      progress?.({ phase: "awaiting-attestation", sourceBlock: receipt.blockNumber });
      throw new ConfigurationError("Source transaction is awaiting attestation");
    }
    progress?.({ phase: "requesting", transactionHash });
    const { proof } = await obtainProof(transactionHash, options.proverUrl);
    progress?.({ phase: "verifying", transactionHash });
    const verified = await verifyBrowserProof(
      context,
      { proof, sourceTransactionHash },
      terms,
      event,
    );
    progress?.({ phase: "verified", transactionHash, checkedBlock: verified.native.blockNumber });
    return { proof, sourceTransactionHash, ...verified };
  });
}
