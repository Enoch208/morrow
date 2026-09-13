import { open, readFile, readdir, unlink } from "node:fs/promises";
import { c5Directory } from "./c5-log.ts";
import { c5ActionPolicy } from "./c5-call-policy.ts";
import { campaignActors } from "./campaign-config.ts";
import { ConfigurationError } from "./errors.ts";

export async function assertC5Locks(
  directory: string,
  records: readonly Record<string, unknown>[],
): Promise<void> {
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".submission-lock") || name === "operator.submission-lock") continue;
    const action = name.slice(0, -".submission-lock".length);
    const policy = c5ActionPolicy(action);
    const value: unknown = JSON.parse(await readFile(`${directory}/${name}`, "utf8"));
    if (
      !value ||
      typeof value !== "object" ||
      !("transactionHash" in value) ||
      !("gasLimit" in value) ||
      !("gasPrice" in value) ||
      typeof value.gasLimit !== "string" ||
      !/^[1-9][0-9]*$/.test(value.gasLimit) ||
      typeof value.gasPrice !== "string" ||
      !/^[1-9][0-9]*$/.test(value.gasPrice)
    )
      throw new ConfigurationError("Invalid C5 public submission intent");
    const record = records.find((entry) => entry.action === action && entry.state === "prepared");
    if (
      !record ||
      typeof value.transactionHash !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(value.transactionHash) ||
      record.costCeiling !== (BigInt(value.gasLimit) * BigInt(value.gasPrice)).toString() ||
      record.chainId !== policy.chainId.toString() ||
      record.contract !== policy.address ||
      (record.sender !== campaignActors[policy.role] &&
        !(action === "c5-redeem" && record.sender === campaignActors.SELLER))
    )
      throw new ConfigurationError(
        "C5 orphan or inconsistent intent; reconcile before further spending",
      );
    for (const field of [
      "action",
      "transactionHash",
      "chainId",
      "sender",
      "contract",
      "nonce",
      "calldataHash",
    ])
      if (!(field in value) || Reflect.get(value, field) !== record[field])
        throw new ConfigurationError("C5 signed intent identity differs from journal");
    if (
      !records.some(
        (entry) =>
          entry.action === action &&
          (entry.state === "mined" || entry.state === "reverted") &&
          entry.transactionHash === record.transactionHash,
      )
    )
      throw new ConfigurationError("C5 unresolved broadcast; reconcile before further spending");
  }
}

export async function withC5Operator<T>(operation: () => Promise<T>): Promise<T> {
  const path = `${c5Directory}/operator.submission-lock`;
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    await handle.sync();
    return await operation();
  } finally {
    await handle.close();
    await unlink(path);
  }
}
