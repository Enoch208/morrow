import { existsSync, openSync, closeSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Wallet } from "ethers";
import { cc3Rpc, errorSummary, provider, repositoryRoot, requireTestnet } from "./environment.ts";

const path = `${repositoryRoot}.env`;
const sourceRpc = "https://ethereum-sepolia-rpc.publicnode.com";

if (existsSync(path)) throw new Error("Local .env already exists; existing credentials preserved");
execFileSync("git", ["check-ignore", "--quiet", ".env"], { cwd: repositoryRoot });

const source = provider(sourceRpc);
const destination = provider(cc3Rpc);

try {
  await Promise.all([requireTestnet(source, 11155111n), requireTestnet(destination, 102031n)]);
  const roles = ["PAYER", "SELLER", "BUYER"] as const;
  const wallets = roles.map((role) => ({ role, wallet: Wallet.createRandom() }));
  if (new Set(wallets.map(({ wallet }) => wallet.address)).size !== roles.length)
    throw new Error("Role address collision");
  const values = [
    `SOURCE_CHAIN_RPC_URL=${sourceRpc}`,
    `CREDITCOIN_RPC_URL=${cc3Rpc}`,
    ...wallets.map(({ role, wallet }) => `${role}_PRIVATE_KEY=${wallet.privateKey}`),
  ];
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${values.join("\n")}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        created: ".env",
        permissions: (statSync(path).mode & 0o777).toString(8),
        sourceChainId: "11155111",
        destinationChainId: "102031",
        addresses: wallets.map(({ role, wallet }) => ({ role, address: wallet.address })),
      },
      null,
      2,
    )}\n`,
  );
} catch (error: unknown) {
  process.stderr.write(`${errorSummary(error)}\n`);
  process.exitCode = 1;
} finally {
  source.destroy();
  destination.destroy();
}
