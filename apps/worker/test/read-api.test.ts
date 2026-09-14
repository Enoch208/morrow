import { test } from "node:test";
import assert from "node:assert/strict";
import { readApiResponse } from "../src/read-api.ts";

const forbidden = () => Promise.reject(new Error("Reader must not be called"));
const readers = { claim: forbidden, sale: forbidden, settlement: forbidden, health: forbidden };

void test("read API rejects writes before touching a chain", async () => {
  assert.equal((await readApiResponse("POST", "/api/v1/claims/2", readers)).status, 405);
});

void test("read API rejects RPC overrides, malformed IDs and overflowing claims", async () => {
  for (const path of [
    "/api/v1/claims/0",
    `/api/v1/claims/${(1n << 256n).toString()}`,
    "/api/v1/sales/0x1234",
    "/api/v1/claims/2?rpc=http://localhost",
  ])
    assert.equal((await readApiResponse("GET", path, readers)).status, 400);
});

void test("read API serializes raw amounts as decimal strings without converting units", async () => {
  const response = await readApiResponse("GET", "/api/v1/claims/2", {
    ...readers,
    claim: (id) =>
      Promise.resolve({
        status: "available",
        value: { claimId: id, amount: 999999999999999999999n },
      }),
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.includes('"amount":"999999999999999999999"'));
  assert.equal(response.headers["cache-control"], "no-store, max-age=0");
});

void test("read API does not return cached green when RPC is unavailable", async () => {
  const response = await readApiResponse("GET", "/api/v1/claims/2", {
    ...readers,
    claim: () => Promise.resolve({ status: "unverifiable", reason: "RPC unavailable" }),
  });
  assert.equal(response.status, 503);
});

void test("read API never reflects a sensitive exception into its response", async () => {
  const response = await readApiResponse("GET", "/api/v1/claims/2", {
    ...readers,
    claim: () => Promise.reject(new Error("sensitive endpoint token")),
  });
  assert.equal(response.status, 503);
  assert.ok(!response.body.includes("sensitive"));
});
