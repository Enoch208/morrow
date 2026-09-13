import { readFileSync } from "node:fs";
import { keccak256 } from "ethers";
import { validateManifest } from "../src/manifest-validation.ts";
import type { SourceClaimState, SourceRoundState } from "../src/source-state.ts";
import { string } from "../src/evidence-files.ts";

export const manifest = validateManifest(
  JSON.parse(
    readFileSync(
      new URL("../../../evidence/manifests/a-1789279123015.json", import.meta.url),
      "utf8",
    ),
  ) as unknown,
);
export const terms = manifest.terms;
export const seller = string(terms.seller),
  buyer = string(terms.buyer);
export const deadline = BigInt(string(terms.assignBefore)),
  maturity = BigInt(string(terms.maturity));
export const claim: SourceClaimState = {
  token: string(terms.sourceToken),
  face: BigInt(string(terms.sourceFaceValueRaw)),
  maturity,
  originalBeneficiary: seller,
  currentBeneficiary: seller,
  activeRound: 0n,
  latestRound: 0n,
  successfulSale: false,
  redeemed: false,
  referenceHash: keccak256("0x"),
};
export const round: SourceRoundState = {
  state: 1n,
  encodedTerms: manifest.identity.encodedTerms,
  saleId: manifest.identity.saleId,
  termsHash: manifest.identity.termsHash,
};
export const reserved = { ...claim, activeRound: 1n, latestRound: 1n };
