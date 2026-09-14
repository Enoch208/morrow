import { MorrowReadClient } from "../dist/index.js";
import process from "node:process";

const client = new MorrowReadClient({
  sourceRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  destinationRpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
});
try {
  const claim = await client.readClaim(2n);
  process.stdout.write(
    JSON.stringify(
      claim,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n",
  );
  if (claim.status !== "available") process.exitCode = 2;
} finally {
  client.destroy();
}
