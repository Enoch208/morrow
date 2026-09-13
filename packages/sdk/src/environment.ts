import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import { FetchRequest, JsonRpcProvider, Wallet } from "ethers";
import { ConfigurationError } from "./errors.ts";

export { ConfigurationError } from "./errors.ts";

export const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const cc3Rpc = "https://rpc.cc3-testnet.creditcoin.network";
export const proverEndpoints = [
  "https://prover.cc3-testnet.creditcoin.network",
  "https://proof-gen-api.cc3-testnet.creditcoin.network",
] as const;

export function localConfiguration(): Record<string, string> {
  const path = `${repositoryRoot}.env`;
  if (!existsSync(path)) return {};
  const configuration: Record<string, string> = {};
  for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
    if (value !== undefined) configuration[key] = value;
  }
  return configuration;
}

export function provider(url: string): JsonRpcProvider {
  const request = new FetchRequest(url);
  request.timeout = 12_000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

export async function requireTestnet(rpc: JsonRpcProvider, expectedChain: bigint): Promise<void> {
  if (expectedChain !== 11155111n && expectedChain !== 102031n)
    throw new ConfigurationError("Unsupported testnet");
  if ((await rpc.getNetwork()).chainId !== expectedChain)
    throw new ConfigurationError("Wrong RPC chain ID");
}

export function localRole(
  configuration: Record<string, string>,
  role: "PAYER" | "SELLER" | "BUYER",
): Wallet {
  const key = configuration[`${role}_PRIVATE_KEY`];
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new ConfigurationError(`${role}_PRIVATE_KEY missing or invalid in local .env`);
  return new Wallet(key);
}

export function errorSummary(error: unknown): string {
  if (error instanceof ConfigurationError) return error.message;
  if (!(error instanceof Error)) return "Unknown failure";
  if ("code" in error && typeof error.code === "string") return `${error.name}: ${error.code}`;
  return error.name;
}
