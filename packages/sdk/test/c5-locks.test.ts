import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertC5Locks } from "../src/c5-locks.ts";
import { ZeroHash } from "ethers";
import { campaignActors, campaignContracts } from "../src/campaign-config.ts";

await test("C5 orphan intent blocks other spending until its full gas commitment is reconciled", async () => {
  const directory = await mkdtemp(join(tmpdir(), "morrow-c5-lock-"));
  try {
    const intent = {
      action: "c5-create",
      transactionHash: ZeroHash,
      gasLimit: "100",
      gasPrice: "2",
      chainId: "11155111",
      sender: campaignActors.PAYER,
      contract: campaignContracts.vault.address,
      nonce: 3,
      calldataHash: ZeroHash,
    };
    await writeFile(join(directory, "c5-create.submission-lock"), JSON.stringify(intent));
    await assert.rejects(assertC5Locks(directory, []), /orphan/);
    const record = { ...intent, state: "prepared", costCeiling: "200" };
    const mined = { ...record, state: "mined" };
    await assert.rejects(assertC5Locks(directory, [record]), /unresolved/);
    await assert.doesNotReject(assertC5Locks(directory, [record, mined]));
    await assert.rejects(
      assertC5Locks(directory, [{ ...record, costCeiling: "1" }]),
      /inconsistent/,
    );
    await assert.rejects(
      assertC5Locks(directory, [{ ...record, chainId: "102031" }, mined]),
      /inconsistent/,
    );
    await assert.rejects(assertC5Locks(directory, [{ ...record, nonce: 4 }, mined]), /identity/);
  } finally {
    await rm(directory, { recursive: true });
  }
});
