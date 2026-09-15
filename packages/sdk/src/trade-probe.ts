import { Interface } from "ethers";
import type { JsonRpcProvider, TransactionReceipt } from "ethers";
import type { SaleTerms } from "@morrow/protocol";
import marketV2Abi from "../../../schemas/abi/MorrowMarketV2.json" with { type: "json" };
import { withBrowserAction } from "./browser-action-context.ts";
import type { BrowserActionOptions } from "./browser-action-context.ts";
import { attestedHeight, verifyBrowserProof } from "./browser-proof.ts";
import { ConfigurationError, proverEndpoints } from "./environment.ts";
import { nativeAddresses, nativeInterfaces } from "./native.ts";
import { obtainProof } from "./proof.ts";
import { minimumAttestedDepth, tradeContracts } from "./trade-contracts.ts";

export type ProbeStep = "fund-shallow-refused" | "verify-front-run";

export const marketV2Interface = new Interface(marketV2Abi);
const verifyAndEmit =
  "verifyAndEmit(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))";

export function isProbeStep(step: string): step is ProbeStep {
  return step === "fund-shallow-refused" || step === "verify-front-run";
}

export async function probeRequest(
  step: ProbeStep,
  terms: SaleTerms,
  reservationHash: string,
  options: BrowserActionOptions,
) {
  return withBrowserAction(options, async (context) => {
    const { proof } = await obtainProof(reservationHash, proverEndpoints[0]);
    const verified = await verifyBrowserProof(
      context,
      { proof, sourceTransactionHash: reservationHash },
      terms,
      "reserve",
    );
    const attested = await attestedHeight(
      context.destination,
      await context.destination.getBlockNumber(),
    );
    const requiredHeight = proof.blockHeight + minimumAttestedDepth;
    const facts = { proofBlockHeight: proof.blockHeight, attestedHeight: attested, requiredHeight };
    if (step === "verify-front-run")
      return {
        to: nativeAddresses.blockProver,
        data: nativeInterfaces.blockProver.encodeFunctionData(verifyAndEmit, [
          proof.chainKey,
          proof.blockHeight,
          proof.encodedTransaction,
          proof.merkleProof,
          proof.continuityProof,
        ]),
        facts,
      };
    if (attested >= requiredHeight)
      throw new ConfigurationError("Attested depth already reached; no shallow refusal to show");
    return {
      to: tradeContracts.market.address,
      data: marketV2Interface.encodeFunctionData("fundReservation", [
        proof,
        verified.logIndex,
        terms,
      ]),
      facts,
    };
  });
}

export async function replayedRefusal(
  rpc: JsonRpcProvider,
  request: { readonly from: string; readonly to: string; readonly data: string },
  blockTag: number,
): Promise<string | undefined> {
  try {
    await rpc.call({ ...request, blockTag });
    return undefined;
  } catch (error: unknown) {
    const data =
      typeof error === "object" && error !== null && "data" in error ? String(error.data) : "";
    return marketV2Interface.parseError(data)?.name;
  }
}

export function probeSucceeded(
  step: ProbeStep,
  receipt: TransactionReceipt,
  replayed: string | undefined,
): boolean {
  if (step === "fund-shallow-refused")
    return (
      receipt.status === 0 && receipt.logs.length === 0 && replayed === "InsufficientAttestedDepth"
    );
  const verified = nativeInterfaces.blockProver.getEvent("TransactionVerified")?.topicHash;
  return (
    receipt.status === 1 &&
    receipt.logs.some(
      (log) =>
        log.address.toLowerCase() === nativeAddresses.blockProver.toLowerCase() &&
        log.topics[0] === verified,
    )
  );
}
