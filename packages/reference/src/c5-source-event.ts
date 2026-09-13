import { ZeroHash } from "ethers";
import { EvidenceError } from "./checker-rpc.ts";
import { c5ReferenceTerms, c5Actors } from "./c5-policy.ts";
import { referenceIdentity } from "./index.ts";
import { applicationInterfaces } from "./manifest-chain.ts";

export function checkC5SourceEvent(
  action: string,
  claimId: string,
  beneficiary: string,
  log: { readonly topics: readonly string[]; readonly data: string },
) {
  const terms = c5ReferenceTerms(claimId, action.startsWith("c5-r2-") ? "2" : "1");
  const identity = referenceIdentity(terms);
  const name =
    action === "c5-create"
      ? "ClaimFunded"
      : action === "c5-redeem"
        ? "ClaimRedeemed"
        : action.endsWith("-reserve")
          ? "SaleReserved"
          : action.endsWith("-assign")
            ? "SaleAssigned"
            : action.endsWith("-cancel")
              ? "SaleCancelled"
              : null;
  if (!name) throw new EvidenceError("Unsupported C5 source event action");
  const args =
    name === "ClaimFunded"
      ? [
          claimId,
          c5Actors.payer,
          c5Actors.seller,
          terms.sourceToken,
          "10000000",
          "1789306200",
          ZeroHash,
        ]
      : name === "ClaimRedeemed"
        ? [claimId, beneficiary, terms.sourceToken, "10000000"]
        : [
            identity.saleId,
            claimId,
            terms.round,
            identity.termsHash,
            ...(name === "SaleReserved" ? [identity.encodedTerms] : []),
          ];
  const fragment = applicationInterfaces.vault.getEvent(name);
  if (!fragment) throw new EvidenceError("C5 source event ABI missing");
  const expected = applicationInterfaces.vault.encodeEventLog(fragment, args);
  if (JSON.stringify(log.topics) !== JSON.stringify(expected.topics) || log.data !== expected.data)
    throw new EvidenceError("C5 full source event topics or canonical data mismatch");
  return { name, topics: log.topics, data: log.data };
}
