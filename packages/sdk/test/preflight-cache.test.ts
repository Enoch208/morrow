import assert from "node:assert/strict";
import test from "node:test";
import { FetchRequest } from "ethers";
import { preflightProvider } from "@morrow/sdk/browser";

await test("browser preflight provider performs consecutive RPC reads without cache reuse", async () => {
  const original = new FetchRequest("https://unit.invalid").getUrlFunc;
  let blockRequests = 0;
  let timeout: number | undefined;
  FetchRequest.registerGetUrl((request) => {
    timeout = request.timeout;
    const body: unknown = JSON.parse(new TextDecoder().decode(request.body ?? undefined));
    assert.ok(typeof body === "object" && body !== null && "method" in body && "id" in body);
    assert.ok(body.method === "eth_chainId" || body.method === "eth_blockNumber");
    const result =
      body.method === "eth_chainId" ? "0xaa36a7" : `0x${(++blockRequests + 100).toString(16)}`;
    return Promise.resolve({
      statusCode: 200,
      statusMessage: "OK",
      headers: { "content-type": "application/json" },
      body: new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", id: body.id, result })),
    });
  });
  const rpc = preflightProvider("https://unit.invalid");
  try {
    assert.equal(await rpc.getBlockNumber(), 101);
    assert.equal(await rpc.getBlockNumber(), 102);
    assert.equal(blockRequests, 2);
    assert.equal(timeout, 12000);
  } finally {
    rpc.destroy();
    FetchRequest.registerGetUrl(original);
  }
});
