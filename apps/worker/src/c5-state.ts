import { ConfigurationError } from "@morrow/sdk/src/errors.ts";

export type C5Row = Readonly<Record<string, unknown>>;
export interface C5Job {
  readonly operation: string;
  readonly action: string;
  readonly completeState: string;
  readonly signs: boolean;
}

const definitions = [
  ["proof-r1-reserve", "c5-r1-reserve-proof", "native-verified"],
  ["cancel1", "c5-r1-cancel", "cancellation-verified"],
  ["reserve2", "c5-r2-reserve", "reservation-verified"],
  ["proof-r1-cancel", "c5-r1-cancel-proof", "native-verified"],
  ["proof-r2-reserve", "c5-r2-reserve-proof", "native-verified"],
  ["approve-settlement", "c5-approve-settlement", "allowance-verified"],
  ["revoke-settlement", "c5-revoke-settlement", "allowance-verified"],
  ["fund", "c5-r2-fund", "bound-verified"],
  ["assign", "c5-r2-assign", "assignment-verified"],
  ["proof-r2-assign", "c5-r2-assign-proof", "native-verified"],
  ["refusal", "c5-refusal", "refusal-verified"],
  ["settle", "c5-r2-settle", "outcome-verified"],
  ["withdraw-seller", "c5-withdraw-seller", "withdrawal-verified"],
  ["withdraw-fee", "c5-withdraw-fee", "withdrawal-verified"],
  ["cancel2", "c5-r2-cancel", "cancellation-verified"],
  ["proof-r2-cancel", "c5-r2-cancel-proof", "native-verified"],
  ["refund", "c5-r2-refund", "outcome-verified"],
  ["withdraw-buyer", "c5-withdraw-buyer", "withdrawal-verified"],
  ["redeem", "c5-redeem", "redemption-verified"],
] as const;

export const c5Jobs: readonly C5Job[] = definitions.map(([operation, action, completeState]) => ({
  operation,
  action,
  completeState,
  signs: !operation.startsWith("proof-") && operation !== "refusal",
}));

export function c5Job(operation: string): C5Job {
  const result = c5Jobs.find((job) => job.operation === operation);
  if (!result) throw new ConfigurationError("Unapproved C5 worker operation");
  return result;
}

function completionState(action: string): string | undefined {
  if (/^c5-(approve|reset|revoke)-(source|settlement)$/.test(action)) return "allowance-verified";
  if (action === "c5-create") return "claim-verified";
  if (action === "c5-r1-reserve") return "reservation-verified";
  return c5Jobs.find((job) => job.action === action)?.completeState;
}

export function c5Complete(action: string, records: readonly C5Row[]): boolean {
  const state = completionState(action);
  if (!state) return false;
  const rows = records.filter((row) => row.action === action);
  const transactions = rows.filter((row) =>
    ["prepared", "submitted", "mined", "reverted"].includes(String(row.state)),
  );
  if (state === "native-verified" || state === "refusal-verified")
    return rows.some((row) => row.state === state);
  if (state === "allowance-verified" && transactions.length === 0)
    return rows.some((row) => row.state === "allowance-already-exact");
  const verified = rows.find((row) => row.state === state);
  if (
    !verified ||
    typeof verified.transactionHash !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(verified.transactionHash)
  )
    return false;
  return (
    transactions.every(
      (row) => row.state !== "reverted" && row.transactionHash === verified.transactionHash,
    ) && transactions.some((row) => row.state === "mined")
  );
}

export function c5Unresolved(
  records: readonly C5Row[],
  locks: ReadonlySet<string>,
): string | undefined {
  const actions = new Set(locks);
  for (const row of records)
    if (["prepared", "submitted", "mined", "reverted"].includes(String(row.state))) {
      if (typeof row.action !== "string") return "invalid-action";
      actions.add(row.action);
    }
  return [...actions].find((action) => !c5Complete(action, records));
}
