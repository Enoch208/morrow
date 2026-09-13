import { open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { checkC5Budget } from "./c5-budget.ts";

export async function reserveC5Budget(
  directory: string,
  action: string,
  chainId: bigint,
  cost: bigint,
  records: () => Promise<readonly Record<string, unknown>[]>,
  prepare: () => Promise<void>,
): Promise<void> {
  const path = join(directory, "budget-reservation.lock");
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({ pid: process.pid, action }));
    await handle.sync();
    checkC5Budget(await records(), action, chainId, cost);
    await prepare();
  } finally {
    await handle.close();
    await unlink(path);
  }
}
