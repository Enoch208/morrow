import { isError } from "ethers";
import type { JsonRpcProvider } from "ethers";
import { applicationInterfaces, applicationPins, applicationRead } from "./manifest-chain.ts";
import { integer } from "./checker-rpc.ts";
import { string } from "./evidence-files.ts";
import { sourceClaim, sourceRound } from "./source-state.ts";
import type { SourceClaimState } from "./source-state.ts";
import type { CampaignManifest, StateRead } from "./manifest-types.ts";

export async function readSourceHistory(
  rpc: JsonRpcProvider,
  manifest: CampaignManifest,
  block: number,
  allowAbsentClaim: boolean,
) {
  const reads: StateRead[] = [];
  const query = async (method: string, args: string[] = []) => {
    const read = await applicationRead(rpc, "vault", method, args, block);
    reads.push(read);
    return applicationInterfaces.vault.decodeFunctionResult(method, read.raw);
  };
  let claim: SourceClaimState | null = null;
  let claimRevertData: string | null = null;
  try {
    claim = sourceClaim((await query("getClaim", [string(manifest.terms.claimId)]))[0]);
  } catch (error: unknown) {
    if (
      !allowAbsentClaim ||
      !isError(error, "CALL_EXCEPTION") ||
      error.data !== applicationInterfaces.vault.getError("InvalidClaim")?.selector
    )
      throw error;
    claimRevertData = error.data;
  }
  const [round, backing, nextClaim, balance] = await Promise.all([
    query("getRound", [string(manifest.terms.claimId), string(manifest.terms.round)]),
    query("totalBacking"),
    query("nextClaimId"),
    applicationRead(rpc, "sourceToken", "balanceOf", [applicationPins.vault.address], block),
  ]);
  reads.push(balance);
  return {
    blockNumber: block,
    reads,
    claimRevertData,
    state: { claim, round: sourceRound(round[0]) },
    accounting: {
      backing: integer(backing[0]),
      nextClaimId: integer(nextClaim[0]),
      balance: integer(
        applicationInterfaces.sourceToken.decodeFunctionResult("balanceOf", balance.raw)[0],
      ),
    },
  };
}
