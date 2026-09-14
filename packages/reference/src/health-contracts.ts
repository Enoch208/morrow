import { Interface, keccak256 } from "ethers";
import vaultAbi from "../../../schemas/abi/FundedPaymentVault.json" with { type: "json" };
import marketAbi from "../../../schemas/abi/MorrowMarket.json" with { type: "json" };
import tokenAbi from "../../../schemas/abi/MorrowTestToken.json" with { type: "json" };
import { pins } from "./deployment-pins.ts";
import { inspectDispatcher } from "./submission-bytecode.ts";
import { HealthMismatch, HealthUnavailable, publicRpc, rpcHex } from "./health-rpc.ts";
import { healthCheck } from "./health-check.ts";
import type { HealthCheck, HealthSession } from "./health-check.ts";

export async function healthCall(
  session: HealthSession,
  to: string,
  iface: Interface,
  method: string,
  args: readonly unknown[] = [],
) {
  const raw = rpcHex(
    await publicRpc(
      session.endpoint,
      "eth_call",
      [{ to, data: iface.encodeFunctionData(method, args) }, session.block.number],
      session.request,
    ),
  );
  return iface.decodeFunctionResult(method, raw);
}

function integer(value: unknown): bigint {
  if (typeof value !== "bigint") throw new HealthUnavailable("Malformed integer result");
  return value;
}

export function accountingVerdict(
  bound: bigint,
  credits: bigint,
  liabilities: bigint,
  balance: bigint,
): string {
  if (bound + credits !== liabilities)
    throw new HealthMismatch("Liabilities do not equal bound funds plus credits");
  if (balance < liabilities) throw new HealthMismatch("Settlement balance is below liabilities");
  return `${liabilities.toString()} liabilities = ${bound.toString()} bound + ${credits.toString()} credits; balance ${balance.toString()} raw units`;
}

export async function runtimes(session: HealthSession, side: "source" | "destination") {
  const targets =
    side === "source"
      ? [
          { name: "vault", address: pins.vault, hash: pins.sourceCodeHash, abi: vaultAbi },
          { name: "source-token", address: pins.sourceToken, hash: pins.tokenCodeHash, abi: null },
        ]
      : [
          { name: "market", address: pins.market, hash: pins.marketCodeHash, abi: marketAbi },
          { name: "settlement-token", address: pins.token, hash: pins.tokenCodeHash, abi: null },
        ];
  const checks: HealthCheck[] = [];
  for (const target of targets) {
    const code = publicRpc(
      session.endpoint,
      "eth_getCode",
      [target.address, session.block.number],
      session.request,
    ).then(rpcHex);
    checks.push(
      await healthCheck(
        `${target.name}-runtime`,
        `${target.name}: address and full runtime hash`,
        async () => {
          const actual = keccak256(await code);
          if (actual !== target.hash)
            throw new HealthMismatch(`${target.address}: runtime differs from pinned deployment`);
          return `${target.address} · keccak256 ${actual} · block ${BigInt(session.block.number).toString()}`;
        },
      ),
    );
    if (target.abi) {
      const abi = target.abi;
      checks.push(
        await healthCheck(
          `${target.name}-surface`,
          `${target.name}: exact ABI dispatcher and forbidden opcodes`,
          async () => {
            const result = inspectDispatcher(await code, abi);
            if (result.status === "fail") throw new HealthMismatch(result.reasons.join("; "));
            if (result.status !== "pass") throw new HealthUnavailable(result.reasons.join("; "));
            return `${result.selectors.length.toString()} exact ABI selectors; zero DELEGATECALL, CALLCODE, SELFDESTRUCT, CREATE or CREATE2`;
          },
        ),
      );
    }
  }
  checks.push(
    await healthCheck(
      `${side}-accounting`,
      `${side}: current backing and liabilities`,
      async () => {
        const token = new Interface(tokenAbi);
        if (side === "source") {
          const [backing, balance] = await Promise.all([
            healthCall(session, pins.vault, new Interface(vaultAbi), "totalBacking"),
            healthCall(session, pins.sourceToken, token, "balanceOf", [pins.vault]),
          ]);
          if (integer(balance[0]) < integer(backing[0]))
            throw new HealthMismatch("Source balance is below payout backing");
          return `${integer(balance[0]).toString()} balance covers ${integer(backing[0]).toString()} backing, raw units`;
        }
        const market = new Interface(marketAbi);
        const [bound, credits, liabilities, balance] = await Promise.all([
          ...["totalBound", "totalCredits", "totalLiabilities"].map((method) =>
            healthCall(session, pins.market, market, method),
          ),
          healthCall(session, pins.token, token, "balanceOf", [pins.market]),
        ]);
        return accountingVerdict(
          integer(bound[0]),
          integer(credits?.[0]),
          integer(liabilities?.[0]),
          integer(balance?.[0]),
        );
      },
    ),
  );
  return checks;
}
