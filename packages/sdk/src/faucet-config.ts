import { campaignContracts } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

export const faucetActions = [
  "deploy-source-faucet",
  "deploy-settlement-faucet",
  "fund-source-faucet",
  "fund-settlement-faucet",
] as const;
export type FaucetAction = (typeof faucetActions)[number];

export const faucetDripRaw = 20_000_000_000n;
export const faucetCooldownSeconds = 86_400n;
export const faucetFundingRaw = 400_000_000_000n;

const gasCap = { 11155111: 10_000_000_000_000_000n, 102031: 50_000_000_000_000_000n } as const;

export function faucetAction(input: string | undefined): FaucetAction {
  const action = faucetActions.find((candidate) => candidate === input);
  if (!action) throw new ConfigurationError(`Choose ${faucetActions.join(", ")}`);
  return action;
}

export function faucetSide(action: FaucetAction) {
  const source = action.endsWith("source-faucet");
  const token = source ? campaignContracts.sourceToken : campaignContracts.settlementToken;
  return {
    deployAction: source ? "deploy-source-faucet" : "deploy-settlement-faucet",
    chainId: token.chainId,
    token: token.address,
  } as const;
}

export function faucetConstructorArguments(action: FaucetAction) {
  return [faucetSide(action).token, faucetDripRaw, faucetCooldownSeconds] as const;
}

export function checkFaucetBudget(
  records: readonly Record<string, unknown>[],
  action: FaucetAction,
  chainId: bigint,
  cost: bigint,
): void {
  if (chainId !== faucetSide(action).chainId)
    throw new ConfigurationError("Faucet action on the wrong chain");
  let committed = 0n;
  for (const record of records) {
    if (
      record.action === action &&
      ["prepared", "submitted", "mined"].includes(String(record.state))
    )
      throw new ConfigurationError("Faucet action already prepared, submitted or mined");
    if (record.chainId !== chainId.toString() || record.state !== "mined") continue;
    if (typeof record.costCeiling !== "string" || !/^\d+$/.test(record.costCeiling))
      throw new ConfigurationError("Invalid faucet gas record");
    committed += BigInt(record.costCeiling);
  }
  const cap = chainId === 11155111n ? gasCap[11155111] : gasCap[102031];
  if (cost <= 0n || committed + cost > cap)
    throw new ConfigurationError("Approved faucet gas cap exceeded");
}
