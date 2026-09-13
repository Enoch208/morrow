import { FetchRequest, JsonRpcProvider } from "ethers";
import { checkRelease } from "./release-check.ts";
import { storeEvidence } from "./evidence-files.ts";
import { EvidenceError } from "./checker-rpc.ts";

const path = process.argv[2];
if (!path || process.argv.length !== 3)
  throw new EvidenceError("Provide one public release candidate JSON path");
function provider(url: string) {
  const request = new FetchRequest(url);
  request.timeout = 12000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}
const source = provider("https://ethereum-sepolia-rpc.publicnode.com");
const destination = provider("https://rpc.cc3-testnet.creditcoin.network");
try {
  const result = await checkRelease(path, source, destination);
  const artifact = await storeEvidence(result);
  process.stdout.write(
    JSON.stringify({
      ...artifact,
      status: result.status,
      sourceAndCampaignsVerified: result.sourceAndCampaignsVerified,
      sourceProvenance: result.provenance.status,
      campaignGaps: result.campaigns.gaps,
      unverifiedGates: result.unverifiedGates,
      checkerMatchesHead: result.checker.matchesHead,
      fullReleaseVerified: result.fullReleaseVerified,
    }) + "\n",
  );
  process.exitCode = 2;
} catch (error: unknown) {
  process.stderr.write(
    JSON.stringify({
      status: "UNVERIFIABLE",
      fullReleaseVerified: false,
      error:
        error instanceof EvidenceError
          ? error.message
          : "Release verification dependency or data unavailable",
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
