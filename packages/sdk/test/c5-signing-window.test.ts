import assert from "node:assert/strict";
import test from "node:test";
import { c5Terms, c5Times } from "../src/c5-config.ts";
import {
  assertC5SigningWindow,
  withC5FundingAdmission,
} from "../src/c5-signing-window.ts";

const terms = c5Terms(4n, 2n);
const ready = new Date(Number(c5Times.readiness) * 1000).toISOString();

await test("C5 native verification cannot consume the final funding admission buffer", async () => {
  let now = terms.fundBefore - 601n;
  const timestamp = now;
  await assert.rejects(
    withC5FundingAdmission(terms, [timestamp, timestamp, timestamp], async () => {
      now += 2n;
      await Promise.resolve();
    }, () => now),
    /ten-minute admission buffer/,
  );
});

await test("C5 native verification cannot return stale source or destination snapshots", async () => {
  for (const staleIndex of [0, 1, 2]) {
    let now = terms.fundBefore - 1000n;
    const timestamps = [now, now, now].map((value, index) =>
      index === staleIndex ? value - 120n : value,
    );
    await assert.rejects(
      withC5FundingAdmission(terms, timestamps, async () => {
        now += 1n;
        await Promise.resolve();
      }, () => now),
      /stale or inconsistent/,
    );
  }
});

await test("C5 funding preserves successful verification and propagates verification failure", async () => {
  const now = terms.fundBefore - 1000n;
  let verified = false;
  await withC5FundingAdmission(terms, [now, now, now], async () => {
    verified = true;
    await Promise.resolve();
  }, () => now);
  assert.equal(verified, true);
  const failure = new Error("Native transport unavailable");
  await assert.rejects(
    withC5FundingAdmission(terms, [now], () => Promise.reject(failure), () => now),
    (error: unknown) => error === failure,
  );
});

await test("C5 final signing clock closes windows even after preflight and nonce reads passed", () => {
  for (const [action, boundary] of [
    ["c5-r2-reserve", c5Times.round2Launch + 1n],
    ["c5-r2-fund", terms.fundBefore - 600n],
    ["c5-r2-assign", terms.assignBefore],
    ["c5-approve-settlement", terms.fundBefore],
  ] as const) {
    assert.doesNotThrow(() => {
      assertC5SigningWindow(action, ready, Number(boundary - 1n) * 1000);
    });
    assert.throws(() => {
      assertC5SigningWindow(action, ready, Number(boundary) * 1000);
    }, /window|buffer|deadline/);
  }
  for (const action of ["c5-create", "c5-r1-reserve", "c5-approve-source"]) {
    assert.doesNotThrow(() => {
      assertC5SigningWindow(action, ready, Number(c5Times.readiness + 300n) * 1000);
    });
    assert.throws(() => {
      assertC5SigningWindow(action, ready, Number(c5Times.readiness + 301n) * 1000);
    }, /stale/);
  }
});

await test("C5 closed admission windows do not block already-authorized cleanup", () => {
  for (const action of [
    "c5-r1-cancel", "c5-r2-cancel", "c5-r2-settle", "c5-r2-refund", "c5-redeem",
    "c5-withdraw-seller", "c5-withdraw-fee", "c5-withdraw-buyer",
    "c5-revoke-source", "c5-revoke-settlement",
  ]) assert.doesNotThrow(() => {
    assertC5SigningWindow(action, ready, Number(c5Times.maturity + 86400n) * 1000);
  });
  for (const now of [NaN, Infinity, -1, 0.5]) assert.throws(() => {
    assertC5SigningWindow("c5-r2-fund", ready, now);
  }, /clock invalid/);
});
