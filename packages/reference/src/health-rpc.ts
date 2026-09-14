export interface RpcEndpoint {
  readonly url: string;
  readonly chainId: number;
}

export interface RpcAttempt {
  readonly endpoint: string;
  readonly status: "PASS" | "FAIL" | "UNVERIFIED";
  readonly latencyMs: number;
  readonly detail: string;
}

export class HealthMismatch extends Error {}
export class HealthUnavailable extends Error {}
export class HealthRevert extends Error {
  readonly data: string;
  constructor(data: string) {
    super("RPC execution reverted");
    this.data = data;
  }
}

export type RpcFetch = typeof fetch;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new HealthUnavailable("Malformed RPC response");
  return value as Record<string, unknown>;
}

export async function publicRpc(
  endpoint: string,
  method: string,
  params: readonly unknown[],
  request: RpcFetch = fetch,
): Promise<unknown> {
  if (!["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"].includes(method))
    throw new HealthMismatch("Health reader refuses non-read-only RPC methods");
  const response = await request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
  });
  if (!response.ok) throw new HealthUnavailable(`RPC HTTP ${response.status.toString()}`);
  const body = object(await response.json());
  if (body.id !== 1 || body.jsonrpc !== "2.0")
    throw new HealthUnavailable("RPC response envelope mismatch");
  if (body.error) {
    const error = object(body.error);
    if (typeof error.data === "string" && /^0x[0-9a-f]{8,}$/i.test(error.data))
      throw new HealthRevert(error.data);
    throw new HealthUnavailable("RPC rejected the read; no decodable execution result");
  }
  if (!("result" in body)) throw new HealthUnavailable("RPC result missing");
  return body.result;
}

export function rpcHex(value: unknown): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/i.test(value))
    throw new HealthUnavailable("Malformed RPC hex data");
  return value;
}

export interface HealthBlock {
  readonly number: string;
  readonly hash: string;
  readonly timestamp: number;
}

export async function readHealthBlock(
  endpoint: string,
  tag: string,
  request: RpcFetch = fetch,
): Promise<HealthBlock> {
  const block = object(await publicRpc(endpoint, "eth_getBlockByNumber", [tag, false], request));
  const number = rpcHex(block.number);
  const hash = rpcHex(block.hash);
  const timestamp = Number(BigInt(rpcHex(block.timestamp)));
  if (!/^0x[0-9a-f]{64}$/i.test(hash) || !Number.isSafeInteger(timestamp))
    throw new HealthUnavailable("Malformed RPC block identity");
  return { number, hash, timestamp };
}

export async function selectHealthEndpoint(
  endpoints: readonly RpcEndpoint[],
  request: RpcFetch = fetch,
  now = Date.now(),
) {
  const observations = await Promise.all(
    endpoints.map(async (endpoint) => {
      const started = Date.now();
      try {
        const id = rpcHex(await publicRpc(endpoint.url, "eth_chainId", [], request));
        if (BigInt(id) !== BigInt(endpoint.chainId)) throw new HealthMismatch("Wrong RPC chain ID");
        const block = await readHealthBlock(endpoint.url, "latest", request);
        const age = Math.floor(now / 1000) - block.timestamp;
        if (age > 180 || age < -30)
          throw new HealthUnavailable("RPC head is stale or future-dated");
        return {
          endpoint,
          block,
          attempt: {
            endpoint: endpoint.url,
            status: "PASS" as const,
            latencyMs: Date.now() - started,
            detail: `Chain ${endpoint.chainId.toString()}, block ${BigInt(block.number).toString()}`,
          },
        };
      } catch (error: unknown) {
        return {
          endpoint,
          block: null,
          attempt: {
            endpoint: endpoint.url,
            status: error instanceof HealthMismatch ? ("FAIL" as const) : ("UNVERIFIED" as const),
            latencyMs: Date.now() - started,
            detail:
              error instanceof HealthMismatch || error instanceof HealthUnavailable
                ? error.message
                : "RPC transport unavailable",
          },
        };
      }
    }),
  );
  return {
    selected: observations.find((entry) => entry.attempt.status === "PASS") ?? null,
    attempts: observations.map((entry) => entry.attempt),
  };
}
