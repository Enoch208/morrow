import { campaignTerms } from "@morrow/sdk/src/campaign-config.ts";

export interface CampaignJob {
  readonly action: string;
  readonly completeState: string;
  readonly notBefore: bigint;
  readonly dependencies: readonly (readonly [string, string])[];
  readonly script: string;
  readonly args: readonly string[];
  readonly signs: boolean;
}

const a = campaignTerms("a", 2n);
const b = campaignTerms("b", 3n);
const gate = campaignTerms("gate", 1n);

export const campaignJobs: readonly CampaignJob[] = [
  {
    action: "a-deadline-check",
    completeState: "delay-safety-verified",
    notBefore: a.assignBefore,
    dependencies: [["a-assign", "assignment-verified"]],
    script: "campaign-delay-cli.ts",
    args: [],
    signs: false,
  },
  {
    action: "a-assign-archive",
    completeState: "archived",
    notBefore: 0n,
    dependencies: [["a-assign", "assignment-verified"]],
    script: "campaign-archive-cli.ts",
    args: ["a", "assign"],
    signs: false,
  },
  ...(["gate", "b"] as const).flatMap((name): CampaignJob[] => [
    {
      action: `${name}-cancel`,
      completeState: "cancellation-verified",
      notBefore: name === "gate" ? gate.assignBefore : b.assignBefore,
      dependencies: [[`${name}-fund`, "bound-verified"]],
      script: "campaign-terminal-source-cli.ts",
      args: [name, "cancel"],
      signs: true,
    },
    {
      action: `${name}-refund`,
      completeState: "outcome-verified",
      notBefore: 0n,
      dependencies:
        name === "gate"
          ? [["gate-cancel", "cancellation-verified"]]
          : [
              ["b-cancel", "cancellation-verified"],
              ["gate-withdraw", "withdrawal-verified"],
            ],
      script: "campaign-outcome-cli.ts",
      args: [name],
      signs: true,
    },
    {
      action: `${name}-withdraw`,
      completeState: "withdrawal-verified",
      notBefore: 0n,
      dependencies: [[`${name}-refund`, "outcome-verified"]],
      script: "campaign-withdraw-cli.ts",
      args: [name],
      signs: true,
    },
    {
      action: `${name}-redeem`,
      completeState: "redemption-verified",
      notBefore: name === "gate" ? gate.maturity : b.maturity,
      dependencies: [[`${name}-cancel`, "cancellation-verified"]],
      script: "campaign-terminal-source-cli.ts",
      args: [name, "redeem"],
      signs: true,
    },
  ]),
  {
    action: "a-redeem",
    completeState: "redemption-verified",
    notBefore: a.maturity,
    dependencies: [["a-assign", "assignment-verified"]],
    script: "campaign-terminal-source-cli.ts",
    args: ["a", "redeem"],
    signs: true,
  },
  {
    action: "a-settle",
    completeState: "outcome-verified",
    notBefore: a.maturity,
    dependencies: [
      ["a-redeem", "redemption-verified"],
      ["a-assign-archive", "archived"],
    ],
    script: "campaign-outcome-cli.ts",
    args: ["a"],
    signs: true,
  },
  {
    action: "a-withdraw",
    completeState: "withdrawal-verified",
    notBefore: 0n,
    dependencies: [["a-settle", "outcome-verified"]],
    script: "campaign-withdraw-cli.ts",
    args: ["a"],
    signs: true,
  },
  {
    action: "withdraw-fee",
    completeState: "withdrawal-verified",
    notBefore: 0n,
    dependencies: [["a-withdraw", "withdrawal-verified"]],
    script: "campaign-withdraw-cli.ts",
    args: ["fee"],
    signs: true,
  },
];

export function jobState(
  job: CampaignJob,
  records: readonly Readonly<Record<string, unknown>>[],
  now: bigint,
  lockedActions: ReadonlySet<string> = new Set(),
) {
  const has = (action: string, state: string) =>
    records.some((record) => record.action === action && record.state === state);
  if (has(job.action, job.completeState)) return "complete";
  if (lockedActions.has(job.action)) return "reconcile";
  if (["prepared", "submitted", "mined", "reverted"].some((state) => has(job.action, state)))
    return "reconcile";
  if (now < job.notBefore || job.dependencies.some(([action, state]) => !has(action, state)))
    return "waiting";
  return "ready";
}
