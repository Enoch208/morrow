import { ContractFactory, Interface, keccak256, zeroPadValue } from "ethers";
import type { JsonRpcProvider, TransactionRequest, Wallet } from "ethers";
import { open } from "node:fs/promises";
import { contractArtifact } from "./artifact.ts";
import {
  checkFaucetBudget,
  faucetAction,
  faucetConstructorArguments,
  faucetFundingRaw,
  faucetSide,
} from "./faucet-config.ts";
import type { FaucetAction } from "./faucet-config.ts";
import { faucetDirectory, faucetRecords, minedFaucetAddress, recordFaucet } from "./faucet-log.ts";
import {
  cc3Rpc,
  ConfigurationError,
  errorSummary,
  localConfiguration,
  localRole,
  provider,
  requireTestnet,
} from "./environment.ts";

const tokenInterface = new Interface([
  "function transfer(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const faucetInterface = new Interface(["function TOKEN() view returns (address)"]);

async function faucetTransaction(action: FaucetAction, rpc: JsonRpcProvider) {
  const side = faucetSide(action);
  if (action.startsWith("deploy")) {
    const artifact = contractArtifact("MorrowTestFaucet");
    const request = await new ContractFactory(artifact.abi, artifact.bytecode).getDeployTransaction(
      ...faucetConstructorArguments(action),
    );
    return { request, context: { creationBytecodeHash: artifact.bytecodeHash } };
  }
  const faucet = minedFaucetAddress(await faucetRecords(), side.deployAction);
  const [bound]: unknown[] = faucetInterface.decodeFunctionResult(
    "TOKEN",
    await rpc.call({ to: faucet, data: faucetInterface.encodeFunctionData("TOKEN") }),
  );
  if (typeof bound !== "string" || bound.toLowerCase() !== side.token.toLowerCase())
    throw new ConfigurationError("Deployed faucet is bound to a different token");
  const request: TransactionRequest = {
    to: side.token,
    data: tokenInterface.encodeFunctionData("transfer", [faucet, faucetFundingRaw]),
  };
  return { request, context: { faucet, amountRaw: faucetFundingRaw } };
}

async function faucetBalance(
  rpc: JsonRpcProvider,
  action: FaucetAction,
  holder: string,
  blockTag: number,
) {
  const raw = await rpc.call({
    to: faucetSide(action).token,
    data: tokenInterface.encodeFunctionData("balanceOf", [holder]),
    blockTag,
  });
  const [balance]: unknown[] = tokenInterface.decodeFunctionResult("balanceOf", raw);
  if (typeof balance !== "bigint") throw new ConfigurationError("Invalid token balance read");
  return balance;
}

async function submit(
  wallet: Wallet,
  action: FaucetAction,
  request: TransactionRequest,
  common: Record<string, unknown>,
  gasLimit: bigint,
  gasPrice: bigint,
) {
  const lock = await open(`${faucetDirectory}/${action}.submission-lock`, "wx", 0o600);
  await lock.close();
  const nonce = await wallet.getNonce("pending");
  await recordFaucet({ ...common, state: "prepared", evidenceKind: "proposed", nonce });
  const response = await wallet.sendTransaction({ ...request, nonce, gasLimit, gasPrice, type: 0 });
  await recordFaucet({
    ...common,
    state: "submitted",
    evidenceKind: "proposed",
    nonce,
    transactionHash: response.hash,
  });
  const receipt = await response.wait(1, 90_000);
  if (!receipt)
    throw new ConfigurationError("Receipt unavailable; reconcile submitted hash before retry");
  return { response, receipt };
}

const action = faucetAction(process.argv[2]);
const broadcast = process.argv.includes("--broadcast");
const configuration = localConfiguration();
const side = faucetSide(action);
const url =
  side.chainId === 11155111n
    ? configuration.SOURCE_CHAIN_RPC_URL
    : (configuration.CREDITCOIN_RPC_URL ?? cc3Rpc);
if (!url) throw new ConfigurationError("Missing RPC for faucet chain");
const rpc = provider(url);
try {
  await requireTestnet(rpc, side.chainId);
  const wallet = localRole(configuration, "PAYER").connect(rpc);
  const { request, context } = await faucetTransaction(action, rpc);
  const estimate = await wallet.estimateGas(request);
  const fee = await rpc.getFeeData();
  const gasPrice = fee.maxFeePerGas ?? fee.gasPrice;
  if (gasPrice === null) throw new ConfigurationError("Gas price unavailable");
  const gasLimit = (estimate * 125n + 99n) / 100n;
  const costCeiling = gasLimit * gasPrice;
  checkFaucetBudget(await faucetRecords(), action, side.chainId, costCeiling);
  if ((await rpc.getBalance(wallet.address)) < costCeiling)
    throw new ConfigurationError("Insufficient testnet gas");
  const common = {
    action,
    chainId: side.chainId,
    sender: wallet.address,
    calldataHash: keccak256(String(request.data)),
    costCeiling,
    ...context,
  };
  await recordFaucet({
    ...common,
    state: "planned",
    evidenceKind: "live-read-verified",
    estimate,
    gasLimit,
    gasPrice,
  });
  if (broadcast) {
    const holder = "faucet" in context ? context.faucet : undefined;
    const { response, receipt } = await submit(wallet, action, request, common, gasLimit, gasPrice);
    const before =
      holder && receipt.status === 1
        ? await faucetBalance(rpc, action, holder, receipt.blockNumber - 1)
        : 0n;
    const after =
      holder && receipt.status === 1
        ? await faucetBalance(rpc, action, holder, receipt.blockNumber)
        : 0n;
    const transfer = tokenInterface.getEvent("Transfer")?.topicHash;
    const deltaMatches = holder
      ? receipt.logs.some(
          (log) =>
            log.address.toLowerCase() === side.token.toLowerCase() &&
            log.topics[0] === transfer &&
            log.topics[2]?.toLowerCase() === zeroPadValue(holder, 32).toLowerCase() &&
            BigInt(log.data) === faucetFundingRaw,
        )
      : Boolean(receipt.contractAddress);
    await recordFaucet({
      ...common,
      state: receipt.status === 1 && deltaMatches ? "mined" : "reverted",
      evidenceKind: "live-testnet-mined",
      transactionHash: response.hash,
      contractAddress: receipt.contractAddress,
      receipt: receipt.toJSON() as unknown,
      ...(holder ? { faucetBalanceBeforeRaw: before, faucetBalanceAfterRaw: after } : {}),
    });
    if (receipt.status !== 1 || !deltaMatches)
      throw new ConfigurationError("Faucet action reverted or balance delta mismatched");
  }
} catch (error: unknown) {
  await recordFaucet({
    action,
    state: "blocked",
    evidenceKind: "blocked",
    error: errorSummary(error),
  });
  process.exitCode = 1;
} finally {
  rpc.destroy();
}
