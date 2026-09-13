import type { InterfaceAbi } from "ethers";
import marketAbi from "@schemas/abi/MorrowMarket.json";
import tokenAbi from "@schemas/abi/MorrowTestToken.json";
import vaultAbi from "@schemas/abi/FundedPaymentVault.json";

export const abis: Readonly<Record<"market" | "vault" | "token", InterfaceAbi>> = {
  market: marketAbi,
  vault: vaultAbi,
  token: tokenAbi,
};
