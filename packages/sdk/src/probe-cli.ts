import { mkdir, writeFile } from "node:fs/promises";
import { readNative } from "./native.ts";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  proverEndpoints,
  repositoryRoot,
  requireTestnet,
} from "./environment.ts";

const configuration = localConfiguration();
const destination = provider(configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
const source = configuration.SOURCE_CHAIN_RPC_URL
  ? provider(configuration.SOURCE_CHAIN_RPC_URL)
  : null;
const checks: {
  name: string;
  evidenceKind: "live-read-verified" | "blocked";
  result?: unknown;
  error?: string;
}[] = [];

async function check(name: string, action: () => Promise<unknown>): Promise<void> {
  try {
    checks.push({ name, evidenceKind: "live-read-verified", result: await action() });
  } catch (error: unknown) {
    checks.push({ name, evidenceKind: "blocked", error: errorSummary(error) });
  }
}

try {
  await requireTestnet(destination, 102031n);
  await Promise.all([
    check("supportedChains", () => readNative(destination, "chainInfo", "get_supported_chains")),
    check("sepoliaAttestation", () =>
      readNative(destination, "chainInfo", "get_latest_attestation_height_and_hash", [1]),
    ),
    check("destinationBlock", async () => {
      const block = await destination.getBlock("finalized");
      if (!block) throw new Error("Finalized block unavailable");
      return { number: block.number, hash: block.hash, timestamp: block.timestamp };
    }),
    ...proverEndpoints.map((endpoint) =>
      check(endpoint, async () => {
        const response = await fetch(`${endpoint}/api/v1/attested-height/1`, {
          signal: AbortSignal.timeout(12_000),
        });
        const body = await response.text();
        if (!response.ok)
          checks.push({
            name: `${endpoint} availability`,
            evidenceKind: "blocked",
            error: `HTTP ${response.status.toString()}: ${body}`,
          });
        return { httpStatus: response.status, body, healthy: response.ok };
      }),
    ),
  ]);
  if (source)
    await check("sourceChain", async () => {
      await requireTestnet(source, 11155111n);
      return { chainId: "11155111", latestBlock: await source.getBlockNumber() };
    });
  else
    checks.push({
      name: "sourceChain",
      evidenceKind: "blocked",
      error: "SOURCE_CHAIN_RPC_URL not configured locally",
    });
  const addresses = new Set<string>();
  for (const role of ["PAYER", "SELLER", "BUYER"] as const) {
    await check(`${role} gas readiness`, async () => {
      const wallet = localRole(configuration, role);
      if (addresses.has(wallet.address))
        throw new ConfigurationError("Role addresses must be distinct");
      addresses.add(wallet.address);
      const destinationGasRaw = await destination.getBalance(wallet.address);
      const sourceGasRaw = source ? await source.getBalance(wallet.address) : null;
      if (destinationGasRaw === 0n || sourceGasRaw === null || sourceGasRaw === 0n)
        checks.push({
          name: `${role} funding`,
          evidenceKind: "blocked",
          error:
            "Gas absent or source RPC unavailable; positive balances still require gas estimates",
        });
      return {
        address: wallet.address,
        destinationGasRaw,
        sourceGasRaw,
        funded: destinationGasRaw > 0n && sourceGasRaw !== null && sourceGasRaw > 0n,
      };
    });
  }
  const report = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    implementationCommit: null,
    checks,
  };
  const json = JSON.stringify(
    report,
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  await mkdir(`${repositoryRoot}evidence/g0`, { recursive: true });
  await writeFile(
    `${repositoryRoot}evidence/g0/environment-${Date.now().toString()}.json`,
    `${json}\n`,
    { flag: "wx" },
  );
  process.stdout.write(`${json}\n`);
  if (checks.some((entry) => entry.evidenceKind === "blocked")) process.exitCode = 1;
} catch (error: unknown) {
  const failure = {
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    implementationCommit: null,
    evidenceKind: "blocked",
    error: errorSummary(error),
    checks,
  };
  const json = JSON.stringify(
    failure,
    (_, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
    2,
  );
  await mkdir(`${repositoryRoot}evidence/g0`, { recursive: true });
  await writeFile(
    `${repositoryRoot}evidence/g0/environment-${Date.now().toString()}.json`,
    `${json}\n`,
    { flag: "wx" },
  );
  process.stderr.write(`${json}\n`);
  process.exitCode = 1;
} finally {
  destination.destroy();
  source?.destroy();
}
