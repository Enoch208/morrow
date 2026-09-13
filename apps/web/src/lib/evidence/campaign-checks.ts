import type { EvidenceLabel } from "@morrow/protocol";
import { deployments } from "@/lib/chain/deployments";
import type { ChainKey } from "@/lib/explorers";
import { findRow, loadActionLog, type CampaignRow } from "./campaign-log";
import { booleanField, fieldAt, isHex } from "./json-fields";

export interface ReplaySpec {
  readonly chain: ChainKey;
  readonly to: string;
  readonly data: string;
  readonly recordedBlock: number;
}

export interface CampaignCheck {
  readonly title: string;
  readonly claim: string;
  readonly expectation: string;
  readonly actualError: string;
  readonly detail: string;
  readonly observedAt: string;
  readonly evidenceKind: EvidenceLabel;
  readonly replay: ReplaySpec | undefined;
}

export interface PendingCheck {
  readonly title: string;
  readonly claim: string;
  readonly expectation: string;
  readonly pendingNote: string;
}

export interface CampaignChecks {
  readonly recorded: readonly CampaignCheck[];
  readonly pending: readonly PendingCheck[];
}

interface CheckSource {
  readonly row: CampaignRow | undefined;
  readonly title: string;
  readonly claim: string;
  readonly expectation: string;
  readonly chain: ChainKey;
  readonly errorPath: readonly string[];
  readonly calldataPath: readonly string[];
  readonly blockPath: readonly string[];
  readonly pendingNote: string | undefined;
}

const chainNames: Readonly<Record<ChainKey, string>> = { sepolia: "Sepolia", cc3: "CC3" };

function stringAt(row: CampaignRow, path: readonly string[]): string | undefined {
  const value = fieldAt(row.fields, path);
  return typeof value === "string" ? value : undefined;
}

function numberAt(row: CampaignRow, path: readonly string[]): number | undefined {
  const value = fieldAt(row.fields, path);
  return typeof value === "number" ? value : undefined;
}

function replaySpec(source: CheckSource, row: CampaignRow): ReplaySpec | undefined {
  const data = stringAt(row, source.calldataPath);
  const recordedBlock = numberAt(row, source.blockPath);
  if (!isHex(data) || recordedBlock === undefined) {
    return undefined;
  }
  const to = source.chain === "cc3" ? deployments.market : deployments.vault;
  return { chain: source.chain, to, data, recordedBlock };
}

function toCheck(source: CheckSource, row: CampaignRow): CampaignCheck | undefined {
  const actualError = stringAt(row, source.errorPath);
  if (!actualError) {
    return undefined;
  }
  const block = numberAt(row, source.blockPath);
  const mined = booleanField(row.fields, "mined") === true ? "mined" : "eth_call, not mined";
  return {
    title: source.title,
    claim: source.claim,
    expectation: source.expectation,
    actualError,
    detail:
      block === undefined
        ? mined
        : `${chainNames[source.chain]} block ${block.toLocaleString("en-US")} · ${mined}`,
    observedAt: row.observedAt,
    evidenceKind: row.evidenceKind,
    replay: replaySpec(source, row),
  };
}

function checkSources(
  campaign: readonly CampaignRow[],
  repeatRound: readonly CampaignRow[],
): readonly CheckSource[] {
  const wrongSale = findRow(campaign, "wrong-sale-proof", "rejection-verified");
  const nativeSameBytes = wrongSale
    ? booleanField(wrongSale.fields, "proofNativeVerifiedWithSameBytes")
    : undefined;
  const recordedCall = {
    errorPath: ["actualError"],
    calldataPath: ["calldata"],
    blockPath: ["blockNumber"],
    pendingNote: undefined,
  };
  return [
    {
      ...recordedCall,
      row: wrongSale,
      title: "Authentic proof, wrong sale",
      claim: "Claim B proof against Claim A",
      expectation:
        nativeSameBytes === true
          ? "Native verifier accepts the same bytes; the market must still refuse them"
          : "The market must refuse proof bound to a different sale",
      chain: "cc3",
    },
    {
      ...recordedCall,
      row: findRow(campaign, "assigned-cancel-refusal", "rejection-verified"),
      title: "Cancel an assigned round",
      claim: "Claim A",
      expectation: "Source vault must refuse cancellation once a round is assigned",
      chain: "sepolia",
    },
    {
      ...recordedCall,
      row: findRow(campaign, "a-deadline-check", "delay-safety-verified"),
      title: "Cancel after deadline with proof held back",
      claim: "Claim A",
      expectation: "Delay changes when evidence arrives, never the source outcome",
      chain: "sepolia",
      calldataPath: ["sourceCalldata"],
      blockPath: ["sourceBlock"],
    },
    {
      row: findRow(repeatRound, "c5-refusal", "refusal-verified"),
      title: "Old-round proof, new round",
      claim: "Claim C round 1 cancellation against round 2",
      expectation: "A cancelled round's authentic proof must never settle the next round",
      chain: "cc3",
      errorPath: ["result", "firstError"],
      calldataPath: ["calldata"],
      blockPath: ["blocks", "destination", "number"],
      pendingNote: "Recorded on the live testnet after Claim C round 2 is assigned",
    },
  ];
}

export function loadCampaignChecks(): CampaignChecks {
  const campaign = loadActionLog("campaign") ?? [];
  const repeatRound = loadActionLog("repeatRound") ?? [];
  const recorded: CampaignCheck[] = [];
  const pending: PendingCheck[] = [];
  for (const source of checkSources(campaign, repeatRound)) {
    const check = source.row ? toCheck(source, source.row) : undefined;
    if (check) {
      recorded.push(check);
    } else if (source.pendingNote) {
      const { title, claim, expectation, pendingNote } = source;
      pending.push({ title, claim, expectation, pendingNote });
    }
  }
  return { recorded, pending };
}
