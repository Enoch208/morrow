import { mkdir } from "node:fs/promises";
import { provider, cc3Rpc, errorSummary } from "./environment.ts";
import { c5Directory, recordC5 } from "./c5-log.ts";
import { c5Readiness } from "./c5-readiness.ts";
import { c5Allowance } from "./c5-allowance.ts";
import { c5Source } from "./c5-source.ts";
import { c5Destination } from "./c5-destination.ts";
import { buildC5Proof } from "./c5-proof.ts";
import { c5Refusal } from "./c5-refusal.ts";
import { withC5Operator } from "./c5-locks.ts";
import { ConfigurationError } from "./errors.ts";

const operation = process.argv[2];
const flags = process.argv.slice(3);
if (!operation || flags.some((flag) => flag !== "--broadcast") || flags.length > 1)
  throw new ConfigurationError("Choose one C5 operation and optional --broadcast");
const broadcast = flags.includes("--broadcast");
const context = {
  source: provider("https://ethereum-sepolia-rpc.publicnode.com"),
  destination: provider(cc3Rpc),
};
async function execute(): Promise<void> {
  if (operation === "refusal") {
    if (broadcast) throw new ConfigurationError("Refusal is read-only");
    return c5Refusal(context);
  }
  if (operation === "readiness") {
    if (broadcast) throw new ConfigurationError("Readiness cannot broadcast");
    return c5Readiness(context);
  }
  for (const side of ["source", "settlement"] as const)
    for (const action of ["approve", "reset", "revoke"] as const)
      if (operation === `${action}-${side}`) return c5Allowance(context, action, side, broadcast);
  for (const action of ["create", "reserve1", "cancel1", "reserve2", "cancel2", "redeem"] as const)
    if (operation === action) return c5Source(context, action, broadcast);
  for (const action of [
    "fund",
    "assign",
    "settle",
    "refund",
    "withdraw-seller",
    "withdraw-fee",
    "withdraw-buyer",
  ] as const)
    if (operation === action) return c5Destination(context, action, broadcast);
  for (const round of [1n, 2n] as const)
    for (const event of ["reserve", "assign", "cancel"] as const)
      if (operation === `proof-r${round.toString()}-${event}`) {
        if (broadcast) throw new ConfigurationError("Proof acquisition cannot broadcast");
        await buildC5Proof(context.source, context.destination, round, event);
        return;
      }
  throw new ConfigurationError("Unsupported C5 operation");
}

try {
  await mkdir(c5Directory, { recursive: true });
  if (broadcast) await withC5Operator(execute);
  else await execute();
} catch (error: unknown) {
  await recordC5({
    action: `c5-cli-${operation}`,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
    broadcastRequested: broadcast,
  });
  process.exitCode = 1;
} finally {
  context.source.destroy();
  context.destination.destroy();
}
