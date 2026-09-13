import { FetchRequest, JsonRpcProvider } from "ethers";
import { verifySubmission } from "./submission-check.ts";
import { storeEvidence } from "./evidence-files.ts";
import { submissionCheck, submissionReport } from "./submission-report.ts";
import { EvidenceError } from "./checker-rpc.ts";

const args = process.argv.slice(2);
const path = args[0] ?? "evidence/release/submission.json";
function provider(url: string) {
  const request = new FetchRequest(url);
  request.timeout = 12000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}
const source = provider("https://ethereum-sepolia-rpc.publicnode.com");
const destination = provider("https://rpc.cc3-testnet.creditcoin.network");
try {
  if (args.length > 1)
    throw new EvidenceError("Expected at most one public release candidate path");
  const result = await verifySubmission(path, source, destination);
  const artifact = await storeEvidence(result);
  process.stdout.write(
    result.text.replace("\nVERDICT:", `\nEvidence: ${artifact.path}\nVERDICT:`) + "\n",
  );
  process.exitCode = result.exitCode;
} catch (error: unknown) {
  const check = await submissionCheck(
    "report",
    "Submission verification report",
    "local-tested",
    () => {
      throw error;
    },
  );
  const report = submissionReport([check]);
  process.stdout.write(report.text + "\n");
  process.exitCode = report.exitCode;
} finally {
  source.destroy();
  destination.destroy();
}
