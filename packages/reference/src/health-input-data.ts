import { Interface } from "ethers";
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import type { HealthProofCase } from "./health-proof.ts";
export type { HealthProofCase } from "./health-proof.ts";

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Expected proof evidence object");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected proof evidence string");
  return value;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new Error("Expected proof evidence block number");
  return value;
}

export function parseHealthProofs(
  campaignRows: readonly unknown[],
  repeatRows: readonly unknown[],
): HealthProofCase[] {
  const campaign = campaignRows.map(record).reverse();
  const repeat = repeatRows.map(record).reverse();
  const wrong = campaign.find(
    (row) => row.action === "wrong-sale-proof" && row.state === "rejection-verified",
  );
  const stale = repeat.find(
    (row) => row.action === "c5-refusal" && row.state === "refusal-verified",
  );
  if (!wrong || !stale) throw new Error("Required recorded proof cases are unavailable");
  const verified = campaign.find(
    (row) => row.state === "native-verified" && row.proofHash === wrong.proofHash,
  );
  const funded = campaign.find((row) => row.action === "b-fund" && row.state === "bound-verified");
  if (!verified || !funded) throw new Error("Matching native verification or sale terms missing");
  const terms = record(funded.terms);
  const market = new Interface(marketAbi);
  const calldata = string(wrong.calldata);
  const decoded = market.decodeFunctionData("fundReservation", calldata);
  const correct = market.encodeFunctionData("fundReservation", [decoded[0], decoded[1], terms]);
  const destination = record(record(stale.blocks).destination);
  return [
    {
      id: "wrong-sale",
      name: "Same proof against matching and wrong sale",
      nativeCalldata: string(record(record(verified.native).verification).calldata),
      marketCalldata: calldata,
      correctMarketCalldata: correct,
      from: string(terms.buyer),
      blockNumber: number(wrong.blockNumber),
      blockHash: string(wrong.blockHash),
      expectedError: "SaleIdMismatch",
    },
    {
      id: "stale-round",
      name: "Old-round proof against later sale round",
      nativeCalldata: string(record(record(stale.native).verification).calldata),
      marketCalldata: string(stale.calldata),
      from: string(stale.caller),
      blockNumber: number(destination.number),
      blockHash: string(destination.hash),
      expectedError: "SaleIdMismatch",
    },
  ];
}
