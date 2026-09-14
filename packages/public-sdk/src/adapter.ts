import { ZeroAddress, isHexString } from "ethers";
import type { Address, Hash, ReadResult, Claim } from "@morrow/protocol";
import { address, vaultInterface } from "./decode.ts";
import { testnetDeployment } from "./deployment.ts";

export interface PayoutRegistration {
  readonly sourceToken: Address;
  readonly faceValueRaw: bigint;
  readonly beneficiary: Address;
  readonly maturity: bigint;
  readonly referenceHash: Hash;
}

export interface PreparedPayoutRegistration {
  readonly chainId: bigint;
  readonly to: Address;
  readonly data: string;
}

export interface PayoutSourceAdapter {
  readonly sourceChainId: bigint;
  readonly sourceVault: Address;
  readClaim(claimId: bigint): Promise<ReadResult<Claim>>;
  prepareRegistration(
    input: PayoutRegistration,
    sourceTimestamp: bigint,
  ): PreparedPayoutRegistration;
}

export function preparePayoutRegistration(
  input: PayoutRegistration,
  sourceTimestamp: bigint,
): PreparedPayoutRegistration {
  if (address(input.sourceToken) !== address(testnetDeployment.sourceToken.address)) {
    throw new Error("Only the deployed source token is supported");
  }
  if (input.faceValueRaw <= 0n || input.maturity <= sourceTimestamp || sourceTimestamp < 0n) {
    throw new Error("A payout requires positive backing and future maturity");
  }
  if (address(input.beneficiary) === ZeroAddress || !isHexString(input.referenceHash, 32)) {
    throw new Error("Invalid beneficiary or reference hash");
  }
  return {
    chainId: testnetDeployment.vault.chainId,
    to: testnetDeployment.vault.address,
    data: vaultInterface.encodeFunctionData("createClaim", [
      input.sourceToken,
      input.faceValueRaw,
      input.beneficiary,
      input.maturity,
      input.referenceHash,
    ]),
  };
}
