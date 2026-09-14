import { FetchRequest, Interface, JsonRpcProvider, isHexString, keccak256 } from "ethers";
import type { Claim, Hash, ReadResult } from "@morrow/protocol";
import type { PayoutSourceAdapter } from "./adapter.ts";
import { preparePayoutRegistration } from "./adapter.ts";
import { decodeClaim, decodeSale, marketInterface, raw, vaultInterface } from "./decode.ts";
import { testnetDeployment } from "./deployment.ts";

export interface MorrowReadOptions {
  readonly sourceRpcUrl: string;
  readonly destinationRpcUrl: string;
}

type Deployment = (typeof testnetDeployment)[keyof typeof testnetDeployment];
class VerificationError extends Error {}

function readFailure(error: unknown): string {
  if (error instanceof VerificationError) return error.message;
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z_]+$/.test(error.code)
  ) {
    return `RPC or ABI read failed: ${error.code}; no archived result substituted`;
  }
  return "RPC or ABI read failed; no archived result substituted";
}
export type SaleStatus = ReturnType<typeof decodeSale>;
export interface SettlementStatus {
  readonly sale: SaleStatus;
  readonly sellerCreditRaw: bigint | null;
  readonly buyerCreditRaw: bigint | null;
  readonly feeRecipientCreditRaw: bigint | null;
  readonly totalLiabilitiesRaw: bigint;
  readonly totalBoundRaw: bigint;
  readonly totalCreditsRaw: bigint;
  readonly marketBalanceRaw: bigint;
}

function provider(url: string): JsonRpcProvider {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("RPC must be an HTTP(S) URL without embedded credentials");
  }
  const request = new FetchRequest(url);
  request.timeout = 8000;
  return new JsonRpcProvider(request, undefined, { batchMaxCount: 1, cacheTimeout: -1 });
}

export class MorrowReadClient implements PayoutSourceAdapter {
  readonly sourceChainId = testnetDeployment.vault.chainId;
  readonly sourceVault = testnetDeployment.vault.address;
  readonly prepareRegistration = preparePayoutRegistration;
  private readonly source: JsonRpcProvider;
  private readonly destination: JsonRpcProvider;

  constructor(options: MorrowReadOptions) {
    this.source = provider(options.sourceRpcUrl);
    this.destination = provider(options.destinationRpcUrl);
  }

  destroy(): void {
    this.source.destroy();
    this.destination.destroy();
  }

  private async snapshot<T>(
    rpc: JsonRpcProvider,
    deployment: Deployment,
    read: (block: number) => Promise<T>,
  ): Promise<ReadResult<T>> {
    try {
      const [network, block] = await Promise.all([rpc.getNetwork(), rpc.getBlock("finalized")]);
      if (network.chainId !== deployment.chainId)
        throw new VerificationError("RPC chain ID differs from the pinned deployment");
      if (!block?.hash) throw new VerificationError("Finalized block unavailable");
      if (keccak256(await rpc.getCode(deployment.address, block.number)) !== deployment.codeHash) {
        throw new VerificationError("Runtime hash differs from the pinned deployment");
      }
      const value = await read(block.number);
      const confirmed = await rpc.getBlock(block.number);
      if (confirmed?.hash !== block.hash)
        throw new VerificationError("Block hash changed during the read");
      return {
        status: "available",
        value,
        observedAt: new Date().toISOString(),
        blockNumber: BigInt(block.number),
        blockHash: block.hash as Hash,
      };
    } catch (error: unknown) {
      return {
        status: "unverifiable",
        observedAt: new Date().toISOString(),
        reason: readFailure(error),
      };
    }
  }

  async readClaim(claimId: bigint): Promise<ReadResult<Claim>> {
    if (claimId <= 0n) throw new Error("Claim ID must be positive");
    return this.snapshot(this.source, testnetDeployment.vault, async (blockTag) =>
      decodeClaim(
        claimId,
        await this.source.call({
          to: this.sourceVault,
          data: vaultInterface.encodeFunctionData("getClaim", [claimId]),
          blockTag,
        }),
      ),
    );
  }

  async readSale(saleId: Hash): Promise<ReadResult<SaleStatus>> {
    if (!isHexString(saleId, 32)) throw new Error("Sale ID must be bytes32");
    return this.snapshot(this.destination, testnetDeployment.market, (blockTag) =>
      this.saleAt(saleId, blockTag),
    );
  }

  private async saleAt(saleId: Hash, blockTag: number): Promise<SaleStatus> {
    return decodeSale(
      saleId,
      await this.destination.call({
        to: testnetDeployment.market.address,
        data: marketInterface.encodeFunctionData("getSale", [saleId]),
        blockTag,
      }),
    );
  }

  async readSettlement(saleId: Hash): Promise<ReadResult<SettlementStatus>> {
    if (!isHexString(saleId, 32)) throw new Error("Sale ID must be bytes32");
    return this.snapshot(this.destination, testnetDeployment.market, async (blockTag) => {
      const sale = await this.saleAt(saleId, blockTag);
      const scalar = async (name: string, args: readonly string[] = []) =>
        raw(
          marketInterface.decodeFunctionResult(
            name,
            await this.destination.call({
              to: testnetDeployment.market.address,
              data: marketInterface.encodeFunctionData(name, args),
              blockTag,
            }),
          )[0],
        );
      const [
        totalLiabilitiesRaw,
        totalBoundRaw,
        totalCreditsRaw,
        sellerCreditRaw,
        buyerCreditRaw,
        feeRecipientCreditRaw,
      ] = await Promise.all([
        scalar("totalLiabilities"),
        scalar("totalBound"),
        scalar("totalCredits"),
        sale.terms ? scalar("credits", [sale.terms.seller]) : Promise.resolve(null),
        sale.terms ? scalar("credits", [sale.terms.buyer]) : Promise.resolve(null),
        sale.terms ? scalar("credits", [sale.terms.feeRecipient]) : Promise.resolve(null),
      ]);
      const token = testnetDeployment.settlementToken;
      if (keccak256(await this.destination.getCode(token.address, blockTag)) !== token.codeHash)
        throw new VerificationError("Settlement token code differs");
      const erc20 = new Interface(["function balanceOf(address) view returns (uint256)"]);
      const marketBalanceRaw = raw(
        erc20.decodeFunctionResult(
          "balanceOf",
          await this.destination.call({
            to: token.address,
            data: erc20.encodeFunctionData("balanceOf", [testnetDeployment.market.address]),
            blockTag,
          }),
        )[0],
      );
      return {
        sale,
        sellerCreditRaw,
        buyerCreditRaw,
        feeRecipientCreditRaw,
        totalLiabilitiesRaw,
        totalBoundRaw,
        totalCreditsRaw,
        marketBalanceRaw,
      };
    });
  }
}
