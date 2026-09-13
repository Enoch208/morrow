import type { EvidenceLabel } from "@morrow/protocol";
import { deployments } from "@/lib/chain/deployments";
import type { ChainKey } from "@/lib/explorers";
import { findRow, loadCampaignLog, type CampaignRow } from "./campaign-log";
import { booleanField, isHex, numberField, stringField } from "./json-fields";

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

interface CheckSource {
  readonly row: CampaignRow | undefined;
  readonly title: string;
  readonly claim: string;
  readonly expectation: string;
  readonly chain: ChainKey;
  readonly calldataField: string;
  readonly blockField: string;
}

const chainNames: Readonly<Record<ChainKey, string>> = { sepolia: "Sepolia", cc3: "CC3" };

function replaySpec(source: CheckSource, row: CampaignRow): ReplaySpec | undefined {
  const data = stringField(row.fields, source.calldataField);
  const recordedBlock = numberField(row.fields, source.blockField);
  if (!isHex(data) || recordedBlock === undefined) {
    return undefined;
  }
  const to = source.chain === "cc3" ? deployments.market : deployments.vault;
  return { chain: source.chain, to, data, recordedBlock };
}

function toCheck(source: CheckSource): CampaignCheck | undefined {
  const { row } = source;
  const actualError = row ? stringField(row.fields, "actualError") : undefined;
  if (!row || !actualError) {
    return undefined;
  }
  const block = numberField(row.fields, source.blockField);
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

export function loadCampaignChecks(): readonly CampaignCheck[] {
  const rows = loadCampaignLog() ?? [];
  const wrongSale = findRow(rows, "wrong-sale-proof", "rejection-verified");
  const nativeSameBytes = wrongSale
    ? booleanField(wrongSale.fields, "proofNativeVerifiedWithSameBytes")
    : undefined;

  const sources: readonly CheckSource[] = [
    {
      row: wrongSale,
      title: "Authentic proof, wrong sale",
      claim: "Claim B proof against Claim A",
      expectation:
        nativeSameBytes === true
          ? "Native verifier accepts the same bytes; the market must still refuse them"
          : "The market must refuse proof bound to a different sale",
      chain: "cc3",
      calldataField: "calldata",
      blockField: "blockNumber",
    },
    {
      row: findRow(rows, "assigned-cancel-refusal", "rejection-verified"),
      title: "Cancel an assigned round",
      claim: "Claim A",
      expectation: "Source vault must refuse cancellation once a round is assigned",
      chain: "sepolia",
      calldataField: "calldata",
      blockField: "blockNumber",
    },
    {
      row: findRow(rows, "a-deadline-check", "delay-safety-verified"),
      title: "Cancel after deadline with proof held back",
      claim: "Claim A",
      expectation: "Delay changes when evidence arrives, never the source outcome",
      chain: "sepolia",
      calldataField: "sourceCalldata",
      blockField: "sourceBlock",
    },
  ];

  return sources.map(toCheck).filter((entry): entry is CampaignCheck => entry !== undefined);
}
