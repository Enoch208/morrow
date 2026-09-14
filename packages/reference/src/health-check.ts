import {
  HealthMismatch,
  HealthUnavailable,
  readHealthBlock,
  selectHealthEndpoint,
} from "./health-rpc.ts";
import type { HealthBlock, RpcEndpoint, RpcFetch } from "./health-rpc.ts";
import { runtimes } from "./health-contracts.ts";
export { accountingVerdict, healthCall } from "./health-contracts.ts";

export interface HealthCheck {
  readonly id: string;
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "UNVERIFIED";
  readonly evidenceKind: "live-read-verified" | "historical-replay";
  readonly detail: string;
  readonly checkedAt: string;
}

export const publicHealthEndpoints = {
  source: [
    { url: "https://ethereum-sepolia-rpc.publicnode.com", chainId: 11155111 },
    { url: "https://1rpc.io/sepolia", chainId: 11155111 },
  ],
  destination: [{ url: "https://rpc.cc3-testnet.creditcoin.network", chainId: 102031 }],
} as const;

export async function healthCheck(
  id: string,
  name: string,
  operation: () => Promise<string>,
  evidenceKind: HealthCheck["evidenceKind"] = "live-read-verified",
): Promise<HealthCheck> {
  try {
    return {
      id,
      name,
      status: "PASS",
      evidenceKind,
      detail: await operation(),
      checkedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    return {
      id,
      name,
      status: error instanceof HealthMismatch ? "FAIL" : "UNVERIFIED",
      evidenceKind,
      detail:
        error instanceof HealthMismatch || error instanceof HealthUnavailable
          ? error.message
          : "RPC or evidence unavailable; no archived result substituted",
      checkedAt: new Date().toISOString(),
    };
  }
}

export interface HealthSession {
  readonly endpoint: string;
  readonly block: HealthBlock;
  readonly request: RpcFetch;
}

export async function currentChainHealth(
  side: "source" | "destination",
  endpoints: readonly RpcEndpoint[],
  request: RpcFetch = fetch,
) {
  const selected = await selectHealthEndpoint(endpoints, request);
  const checks: HealthCheck[] = selected.attempts.map((attempt, index) => ({
    id: `${side}-rpc-${index.toString()}`,
    name: `${side} RPC: ${attempt.endpoint}`,
    status: attempt.status,
    evidenceKind: "live-read-verified",
    detail: `${attempt.detail} · ${attempt.latencyMs.toString()} ms`,
    checkedAt: new Date().toISOString(),
  }));
  const choice = selected.selected;
  if (!choice?.block) {
    const role = side === "source" ? "vault" : "market";
    const token = side === "source" ? "source-token" : "settlement-token";
    for (const id of [
      `${role}-runtime`,
      `${role}-surface`,
      `${token}-runtime`,
      `${side}-accounting`,
      `${side}-canonical`,
    ])
      checks.push({
        id,
        name: id,
        status: "UNVERIFIED",
        evidenceKind: "live-read-verified",
        detail: "No healthy RPC available; this check was not performed",
        checkedAt: new Date().toISOString(),
      });
    return { checks, session: null };
  }
  const session: HealthSession = { endpoint: choice.endpoint.url, block: choice.block, request };
  checks.push(...(await runtimes(session, side)));
  const canonical = await healthCheck(
    `${side}-canonical`,
    `${side}: observation block remains canonical`,
    async () => {
      const reread = await readHealthBlock(session.endpoint, session.block.number, request);
      if (reread.hash !== session.block.hash)
        throw new HealthUnavailable("Observation block reorganized; rerun verification");
      return `${BigInt(reread.number).toString()} · ${reread.hash}`;
    },
  );
  checks.push(canonical);
  if (canonical.status !== "PASS") {
    return {
      checks: checks.map((check) =>
        check.status === "PASS"
          ? {
              ...check,
              status: "UNVERIFIED" as const,
              detail: "Observation could not be confirmed canonical; rerun verification",
            }
          : check,
      ),
      session: null,
    };
  }
  return { checks, session };
}
