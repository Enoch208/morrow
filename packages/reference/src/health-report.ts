import { currentChainHealth, publicHealthEndpoints } from "./health-check.ts";
import type { HealthCheck } from "./health-check.ts";
import { proofHealth } from "./health-proof.ts";
import type { HealthProofCase } from "./health-proof.ts";
import type { RpcFetch, RpcEndpoint } from "./health-rpc.ts";

export function summarizeHealth(checks: readonly HealthCheck[]) {
  const counts = { PASS: 0, FAIL: 0, UNVERIFIED: 0 };
  for (const check of checks) counts[check.status]++;
  return {
    counts,
    verdict: counts.FAIL
      ? ("FAIL" as const)
      : counts.UNVERIFIED || !checks.length
        ? ("UNVERIFIED" as const)
        : ("PASS" as const),
    checkedAt: new Date().toISOString(),
    checks,
    scope:
      "Live health and selected proof replays. Not the separate 26-check submission verifier, an audit, or a new trade.",
  };
}

export async function verifyHealth(
  proofs: readonly HealthProofCase[],
  request: RpcFetch = fetch,
  endpoints: {
    readonly source: readonly RpcEndpoint[];
    readonly destination: readonly RpcEndpoint[];
  } = publicHealthEndpoints,
) {
  const [source, destination] = await Promise.all([
    currentChainHealth("source", endpoints.source, request),
    currentChainHealth("destination", endpoints.destination, request),
  ]);
  const replays = await Promise.all(
    ["wrong-sale", "stale-round"].flatMap((id) => {
      const matches = proofs.filter((proof) => proof.id === id);
      const proof = matches.length === 1 ? matches[0] : undefined;
      if (proof)
        return [
          proofHealth(destination.session, proof, true),
          proofHealth(destination.session, proof, false),
        ];
      return [true, false].map((historical): Promise<HealthCheck> =>
        Promise.resolve({
          id: `${id}-${historical ? "historical" : "current"}`,
          name: `${id}: required proof input`,
          status: "UNVERIFIED",
          evidenceKind: historical ? "historical-replay" : "live-read-verified",
          detail: "Unique required proof input unavailable; no archived success substituted",
          checkedAt: new Date().toISOString(),
        }),
      );
    }),
  );
  return {
    ...summarizeHealth([...source.checks, ...destination.checks, ...replays]),
    sourceBlock: source.session?.block ?? null,
    destinationBlock: destination.session?.block ?? null,
    endpoints: {
      source: source.session?.endpoint ?? null,
      destination: destination.session?.endpoint ?? null,
    },
  };
}
