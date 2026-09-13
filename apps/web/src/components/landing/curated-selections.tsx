import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { ProductCard } from "./product-card";
import { tradeProducts } from "./trade-products";

export function CuratedSelections({ evidence }: { evidence: ClaimAEvidence }) {
  return (
    <div id="how-it-works" className="mb-32 scroll-mt-32">
      <div className="flex animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.2s_both] mb-12 items-end justify-between">
        <div>
          <h2 className="text-3xl font-medium tracking-tight text-white mb-2">
            One sale, three roles
          </h2>
          <p className="text-neutral-500 text-sm">
            Claim A, live on Sepolia and Creditcoin testnet. Gross price, fee and seller net are
            separate numbers; test tokens carry no monetary value.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {tradeProducts(evidence).map((product) => (
          <ProductCard key={product.name} product={product} />
        ))}
      </div>
    </div>
  );
}
