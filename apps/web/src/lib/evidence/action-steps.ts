import type { CampaignRow } from "./campaign-log";

export interface ActionStep {
  readonly round: number | undefined;
  readonly step: string;
}

const roundScopedStep = /^r(\d+)-(.+)$/;

export function actionStep(action: string, actionPrefix: string): ActionStep {
  const local = action.startsWith(`${actionPrefix}-`)
    ? action.slice(actionPrefix.length + 1)
    : action;
  const match = roundScopedStep.exec(local);
  const round = match?.[1];
  const step = match?.[2];
  return round !== undefined && step !== undefined
    ? { round: Number(round), step }
    : { round: undefined, step: local };
}

export function findLatestStep(
  rows: readonly CampaignRow[],
  actionPrefix: string,
  step: string,
  state: string,
): CampaignRow | undefined {
  return [...rows]
    .reverse()
    .find((row) => row.state === state && actionStep(row.action, actionPrefix).step === step);
}
