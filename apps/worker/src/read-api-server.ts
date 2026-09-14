import { createServer } from "node:http";
import { MorrowReadClient } from "@morrow-protocol/sdk";
import { verifyHealth } from "@morrow/reference/health";
import { loadHealthProofs } from "@morrow/reference/health-inputs";
import { jsonResponse, readApiResponse } from "./read-api.ts";

const portText = process.argv[2] ?? "4180";
if (process.argv.length > 3) throw new Error("Expected at most one local API port");
if (!/^[0-9]{1,5}$/.test(portText) || Number(portText) < 1024 || Number(portText) > 65535)
  throw new Error("Local API port must be between 1024 and 65535");
const client = new MorrowReadClient({
  sourceRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  destinationRpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
});
const readers = {
  claim: (id: bigint) => client.readClaim(id),
  sale: (id: `0x${string}`) => client.readSale(id),
  settlement: (id: `0x${string}`) => client.readSettlement(id),
  health: async () => verifyHealth(await loadHealthProofs()),
};
let active = 0;
let healthActive = false;
const server = createServer((request, response) => {
  const path = request.url ?? "/";
  const health = path === "/api/v1/health";
  if (active >= 4 || (health && healthActive)) {
    const result = jsonResponse(429, {
      status: "unverifiable",
      reason: "Live check already running; retry after it completes",
    });
    response.writeHead(result.status, { ...result.headers, "retry-after": "15" }).end(result.body);
    return;
  }
  active++;
  if (health) healthActive = true;
  void readApiResponse(request.method ?? "", path, readers)
    .then((result) => {
      response.writeHead(result.status, result.headers).end(result.body);
    })
    .finally(() => {
      active--;
      if (health) healthActive = false;
    });
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(portText), "127.0.0.1", () => {
  process.stdout.write(`Read-only Morrow API: http://127.0.0.1:${portText}/api/v1/health\n`);
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () =>
    server.close(() => {
      client.destroy();
    }),
  );
