import { ZeroHash } from "ethers";
import type { campaignActors} from "./campaign-config.ts";
import { campaignContracts } from "./campaign-config.ts";
import { contractInterfaces } from "./contract-reads.ts";
import { c5Terms } from "./c5-config.ts";
import { saleIdentity } from "./canonical.ts";
import { ConfigurationError } from "./errors.ts";

type Role = keyof typeof campaignActors;
type Contract = keyof typeof campaignContracts;
const actions: Record<string, readonly [Role, Contract, string]> = {
  "c5-approve-source": ["PAYER", "sourceToken", "approve"],
  "c5-reset-source": ["PAYER", "sourceToken", "approve"],
  "c5-revoke-source": ["PAYER", "sourceToken", "approve"],
  "c5-approve-settlement": ["BUYER", "settlementToken", "approve"],
  "c5-reset-settlement": ["BUYER", "settlementToken", "approve"],
  "c5-revoke-settlement": ["BUYER", "settlementToken", "approve"],
  "c5-create": ["PAYER", "vault", "createClaim"],
  "c5-r1-reserve": ["SELLER", "vault", "reserveSale"],
  "c5-r1-cancel": ["SELLER", "vault", "cancelExpiredSale"],
  "c5-r2-reserve": ["SELLER", "vault", "reserveSale"],
  "c5-r2-cancel": ["SELLER", "vault", "cancelExpiredSale"],
  "c5-r2-fund": ["BUYER", "market", "fundReservation"],
  "c5-r2-assign": ["SELLER", "vault", "assignSale"],
  "c5-r2-settle": ["PAYER", "market", "settleAssignment"],
  "c5-r2-refund": ["PAYER", "market", "recognizeCancellation"],
  "c5-withdraw-seller": ["SELLER", "market", "withdraw"],
  "c5-withdraw-fee": ["PAYER", "market", "withdraw"],
  "c5-withdraw-buyer": ["BUYER", "market", "withdraw"],
  "c5-redeem": ["BUYER", "vault", "redeem"],
};

export function requireC5Action(action: string): void {
  if (!Object.hasOwn(actions, action)) throw new ConfigurationError("Unsupported C5 action");
}

export function c5ActionPolicy(action: string) {
  requireC5Action(action);
  const value = actions[action];
  if (!value) throw new ConfigurationError("Missing C5 action policy");
  return { role: value[0], contract: value[1], method: value[2], ...campaignContracts[value[1]] };
}

export function validateC5Call(
  action: string,
  role: Role,
  contract: Contract,
  method: string,
  args: readonly unknown[],
  claimId: bigint,
): string {
  requireC5Action(action);
  const approved = actions[action];
  if (
    approved?.[1] !== contract ||
    approved[2] !== method ||
    (approved[0] !== role && !(action === "c5-redeem" && role === "SELLER"))
  )
    throw new ConfigurationError("C5 actor, target or method differs from approval");
  const terms = c5Terms(claimId, action.startsWith("c5-r1-") ? 1n : 2n);
  const identity = saleIdentity(terms);
  let expected: readonly unknown[];
  if (method === "approve") {
    const source = contract === "sourceToken";
    expected = [
      source ? terms.sourceVault : terms.destinationMarket,
      action.startsWith("c5-approve-")
        ? source
          ? terms.sourceFaceValueRaw
          : terms.grossPurchasePriceRaw
        : 0n,
    ];
  } else if (method === "createClaim") {
    expected = [
      terms.sourceToken,
      terms.sourceFaceValueRaw,
      terms.seller,
      terms.maturity,
      ZeroHash,
    ];
  } else {
    if (claimId <= 0n) throw new ConfigurationError("C5 requires receipt-derived claim ID");
    if (method === "reserveSale") expected = [claimId, terms];
    else if (method === "assignSale") expected = [claimId, 2n, identity.termsHash];
    else if (method === "cancelExpiredSale") expected = [claimId, terms.round];
    else if (method === "redeem") expected = [claimId];
    else if (method === "withdraw") expected = [];
    else {
      if (args.length !== 3 || !Number.isSafeInteger(args[1]) || Number(args[1]) < 0)
        throw new ConfigurationError("Invalid C5 proof log selection");
      expected = [args[0], args[1], method === "fundReservation" ? terms : identity.saleId];
    }
  }
  const abi = contractInterfaces[contract];
  const data = abi.encodeFunctionData(method, args);
  if (data !== abi.encodeFunctionData(method, expected))
    throw new ConfigurationError("C5 calldata differs from fixed approval");
  return data;
}
