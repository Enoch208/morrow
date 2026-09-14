import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HealthMismatch,
  HealthRevert,
  publicRpc,
  selectHealthEndpoint,
} from "../src/health-rpc.ts";

const hash = `0x${"ab".repeat(32)}`;
const now = 1800000000000;
const endpoints = [
  { url: "https://first.invalid", chainId: 11155111 },
  { url: "https://second.invalid", chainId: 11155111 },
] as const;

function methodOf(init: RequestInit | undefined): string {
  assert.equal(typeof init?.body, "string");
  const { method } = JSON.parse(init?.body as string) as { method: string };
  return method;
}

void test("health transport refuses signing and broadcast methods before network access", async () => {
  await assert.rejects(publicRpc(endpoints[0].url, "eth_sendRawTransaction", []), HealthMismatch);
});

void test("endpoint failure is disclosed while a healthy redundant endpoint is selected", async () => {
  const result = await selectHealthEndpoint(
    endpoints,
    (url, init) => {
      if (url === endpoints[0].url) return Promise.reject(new Error("TLS failed"));
      const method = methodOf(init);
      return Promise.resolve(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          result:
            method === "eth_chainId"
              ? "0xaa36a7"
              : { number: "0x1234", hash, timestamp: `0x${(now / 1000).toString(16)}` },
        }),
      );
    },
    now,
  );
  assert.equal(result.selected?.endpoint.url, endpoints[1].url);
  assert.deepEqual(
    result.attempts.map((item) => item.status),
    ["UNVERIFIED", "PASS"],
  );
});

void test("wrong chain cannot qualify as healthy", async () => {
  const result = await selectHealthEndpoint(
    endpoints.slice(0, 1),
    () => Promise.resolve(Response.json({ jsonrpc: "2.0", id: 1, result: "0x1" })),
    now,
  );
  assert.equal(result.selected, null);
  assert.equal(result.attempts[0]?.status, "FAIL");
});

void test("missing and stale responses never fall back to archived success", async () => {
  const result = await selectHealthEndpoint(
    endpoints,
    (_url, init) => {
      const method = methodOf(init);
      return Promise.resolve(
        Response.json({
          jsonrpc: "2.0",
          id: 1,
          result:
            method === "eth_chainId" ? "0xaa36a7" : { number: "0x1234", hash, timestamp: "0x1" },
        }),
      );
    },
    now,
  );
  assert.equal(result.selected, null);
  assert.ok(result.attempts.every((item) => item.status === "UNVERIFIED"));
});

void test("a real decoded execution revert stays separate from transport failure", async () => {
  await assert.rejects(
    publicRpc(endpoints[0].url, "eth_call", [], () =>
      Promise.resolve(
        Response.json({ jsonrpc: "2.0", id: 1, error: { code: 3, data: "0xdeadbeef" } }),
      ),
    ),
    HealthRevert,
  );
});
