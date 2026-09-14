export interface ApiReaders {
  readonly claim: (id: bigint) => Promise<unknown>;
  readonly sale: (id: `0x${string}`) => Promise<unknown>;
  readonly settlement: (id: `0x${string}`) => Promise<unknown>;
  readonly health: () => Promise<unknown>;
}

export function jsonResponse(status: number, value: unknown) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  };
}

function unavailable(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (("status" in value && value.status === "unverifiable") ||
      ("verdict" in value && value.verdict !== "PASS"))
  );
}

export async function readApiResponse(method: string, path: string, readers: ApiReaders) {
  if (method !== "GET") return jsonResponse(405, { error: "Read-only API; GET required" });
  if (path.length > 200 || path.includes("?") || path.includes("%"))
    return jsonResponse(400, { error: "Query parameters and encoded paths are not supported" });
  const match = /^\/api\/v1\/(claims|sales|settlements)\/([^/]+)$/.exec(path);
  if (path !== "/api/v1/health" && !match)
    return jsonResponse(404, { error: "Unknown read-only resource" });
  let read = readers.health;
  if (match) {
    const [, resource, id] = match;
    if (!id) return jsonResponse(400, { error: "Missing resource identity" });
    if (resource === "claims") {
      if (!/^[1-9][0-9]{0,77}$/.test(id) || BigInt(id) >= 1n << 256n)
        return jsonResponse(400, { error: "Claim ID must be a positive uint256" });
      read = () => readers.claim(BigInt(id));
    } else {
      if (!/^0x[0-9a-fA-F]{64}$/.test(id))
        return jsonResponse(400, { error: "Sale ID must be bytes32" });
      const hash = id as `0x${string}`;
      read = () => (resource === "sales" ? readers.sale(hash) : readers.settlement(hash));
    }
  }
  try {
    const value = await read();
    return jsonResponse(unavailable(value) ? 503 : 200, value);
  } catch {
    return jsonResponse(503, {
      status: "unverifiable",
      observedAt: new Date().toISOString(),
      reason: "Live dependency unavailable; no archived result substituted",
    });
  }
}
