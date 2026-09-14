import { MorrowReadClient } from "@morrow-protocol/sdk";
import { verifyHealth } from "@morrow/reference/health";
import { readApiResponse } from "@morrow/worker/read-api";
import { loadPublicHealthProofs } from "@/lib/evidence/health-proofs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = new MorrowReadClient({
    sourceRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    destinationRpcUrl: "https://rpc.cc3-testnet.creditcoin.network",
  });
  try {
    const result = await readApiResponse(request.method, url.pathname + url.search, {
      claim: (id) => client.readClaim(id),
      sale: (id) => client.readSale(id),
      settlement: (id) => client.readSettlement(id),
      health: () => verifyHealth(loadPublicHealthProofs()),
    });
    return new Response(result.body, { status: result.status, headers: result.headers });
  } finally {
    client.destroy();
  }
}
