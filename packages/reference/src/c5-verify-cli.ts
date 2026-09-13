import { FetchRequest, JsonRpcProvider } from "ethers";
import { verifyC5 } from "./c5-verify.ts";
import { storeEvidence } from "./evidence-files.ts";

function provider(url: string) {
  const request = new FetchRequest(url);
  request.timeout = 12000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

const source = provider("https://ethereum-sepolia-rpc.publicnode.com");
const destination = provider("https://rpc.cc3-testnet.creditcoin.network");
try {
  const result = await verifyC5(source, destination);
  const artifact = await storeEvidence(result);
  process.stdout.write(
    JSON.stringify({
      ...artifact,
      status: result.status,
      verified: result.verified,
      missing: result.missing,
      c5Verified: result.c5Verified,
      fullReleaseVerified: false,
    }) + "\n",
  );
  if (!result.c5Verified) process.exitCode = 2;
} catch (error: unknown) {
  process.stderr.write(
    JSON.stringify({
      status: "UNVERIFIABLE",
      fullReleaseVerified: false,
      error: error instanceof Error ? error.message : String(error),
    }) + "\n",
  );
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
