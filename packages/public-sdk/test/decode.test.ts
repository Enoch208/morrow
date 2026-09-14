import assert from "node:assert/strict";
import test from "node:test";
import { Interface } from "ethers";
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };
import { decodeClaim, decodeSale } from "../src/decode.ts";
import { preparePayoutRegistration } from "../src/adapter.ts";
import { testnetDeployment } from "../src/deployment.ts";

const beneficiary = "0x0000000000000000000000000000000000000001";
const iface = new Interface(vaultAbi);
const referenceHash = `0x${"00".repeat(32)}` as const;

void test("claim decoder preserves raw bigint values and distinguishes redeemed state", () => {
  const raw = iface.encodeFunctionResult("getClaim", [
    [
      testnetDeployment.sourceToken.address,
      9007199254740993n,
      1900000000n,
      beneficiary,
      beneficiary,
      0n,
      2n,
      true,
      true,
      referenceHash,
    ],
  ]);
  const claim = decodeClaim(4n, raw);
  assert.equal(claim.sourceFaceValueRaw, 9007199254740993n);
  assert.equal(claim.redeemed, true);
  assert.equal(claim.latestRound, 2n);
});

void test("malformed result cannot turn into an available claim or sale", () => {
  assert.throws(() => decodeClaim(1n, "0x"));
  assert.throws(() => decodeSale(referenceHash, "0x"));
});

void test("registration encodes the deployed createClaim selector without sending", () => {
  const request = preparePayoutRegistration(
    {
      sourceToken: testnetDeployment.sourceToken.address,
      faceValueRaw: 1000001n,
      beneficiary,
      maturity: 1900000000n,
      referenceHash,
    },
    1800000000n,
  );
  assert.equal(request.to, testnetDeployment.vault.address);
  assert.equal(request.chainId, 11155111n);
  const decoded = iface.decodeFunctionData("createClaim", request.data);
  assert.equal(decoded[1], 1000001n);
  assert.equal(decoded[2], beneficiary);
});

void test("registration refuses unsupported backing, past maturity, and empty principal", () => {
  const input = {
    sourceToken: testnetDeployment.sourceToken.address,
    faceValueRaw: 1n,
    beneficiary,
    maturity: 1900000000n,
    referenceHash,
  } as const;
  assert.throws(() =>
    preparePayoutRegistration({ ...input, sourceToken: beneficiary }, 1800000000n),
  );
  assert.throws(() => preparePayoutRegistration({ ...input, maturity: 1800000000n }, 1800000000n));
  assert.throws(() => preparePayoutRegistration({ ...input, faceValueRaw: 0n }, 1800000000n));
});
