import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const config = fileURLToPath(new URL("gitleaks.toml", import.meta.url));
const binary = process.env.MORROW_GITLEAKS_BINARY ?? "gitleaks";

function scan(input) {
  const result = spawnSync(binary, ["stdin", "--config", config, "--redact=100", "--no-banner"], {
    input,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error) throw result.error;
  assert.ok(result.status === 0 || result.status === 1, "Secret scanner must execute successfully");
  return result.status;
}

for (const field of ["apiKey", "accessToken", "privateKey", "password", "clientSecret"])
  test(`continues detecting ${field} assignments`, () => {
    assert.equal(scan(`${field}: "${randomBytes(32).toString("hex")}"\n`), 1);
  });

for (const field of ["sourceToken", "settlementToken", "token"])
  test(`recognizes an explicitly named public EVM ${field} address`, () => {
    assert.equal(scan(`${field}: "0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9"\n`), 0);
    assert.equal(scan(`${field}: "0x${randomBytes(20).toString("hex")}"\n`), 1);
    assert.equal(scan(`${field}: "${randomBytes(32).toString("hex")}"\n`), 1);
  });

for (const field of ["claimKey", "eventKey", "authenticSourceEventKey"])
  test(`recognizes a canonical public ${field} hash without hiding adjacent credentials`, () => {
    assert.equal(scan(`${field}: "0x${randomBytes(32).toString("hex")}"\n`), 0);
    assert.equal(
      scan(
        `${field}: "0x${randomBytes(32).toString("hex")}", apiKey: "${randomBytes(32).toString("hex")}"\n`,
      ),
      1,
    );
  });

test("only classifies the exact published runtime hash as public", () => {
  assert.equal(
    scan('tokenCodeHash: "0x2ebb03f50ccc7b228f8b7eaa868e81f7edbdd47cf4dd98f1dff2655a683ef65e"\n'),
    0,
  );
  assert.equal(scan(`tokenCodeHash: "0x${randomBytes(32).toString("hex")}"\n`), 1);
});
