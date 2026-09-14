import { MorrowReadClient } from "@morrow-protocol/sdk";
import { verifyHealth } from "@morrow/reference/health";
import { readApiResponse } from "@morrow/worker/read-api";
import { loadPublicHealthProofs } from "@/lib/evidence/health-proofs";
import { chains } from "@/lib/explorers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = new MorrowReadClient({
    sourceRpcUrl: chains.sepolia.rpc,
    destinationRpcUrl: chains.cc3.rpc,
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
