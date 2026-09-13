import { stateLanguage } from "@morrow/protocol";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { chains, transactionUrl, type ChainKey } from "@/lib/explorers";
import { saleAmounts, type SaleAmounts } from "@/lib/format/sale-amounts";
import { landingImages } from "./landing-images";
import type { Product } from "./product-card";
import { PhoneAmountScreen } from "./screens/phone-amount-screen";
import { screens } from "./screens/screen-geometry";

const outlineAction =
  "w-full rounded-full border border-white/10 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-white hover:text-black";
const accentBadge = "text-[10px] font-bold uppercase tracking-widest text-red-500";

function amountOrUnavailable(
  amounts: SaleAmounts | undefined,
  pick: (value: SaleAmounts) => string,
) {
  return amounts ? pick(amounts) : stateLanguage.EVIDENCE_UNAVAILABLE;
}

export function tradeProducts(evidence: ClaimAEvidence): readonly Product[] {
  const amounts =
    evidence.status === "available" ? saleAmounts(evidence.snapshot.terms) : undefined;
  const face = amountOrUnavailable(amounts, (value) => value.faceValue);
  const gross = amountOrUnavailable(amounts, (value) => value.grossPrice);
  const net = amountOrUnavailable(amounts, (value) => value.sellerNet);
  const fee = amountOrUnavailable(amounts, (value) => value.fee);
  const transactions = evidence.status === "available" ? evidence.snapshot.transactions : undefined;
  const link = (chain: ChainKey, hash: string | undefined) =>
    hash ? transactionUrl(chain, hash) : "#verify";

  return [
    {
      name: "Treasury funds the payout",
      price: `${face} mSRC locked on Sepolia`,
      badge: "1 · Payer",
      image: landingImages.tradePayer,
      screen: screens.payerPhone,
      screenContent: <PhoneAmountScreen eyebrow="Funded" amount={face} unit="mSRC" />,
      action: `Funding on ${chains.sepolia.explorer}`,
      href: link("sepolia", transactions?.create),
      cardClassName:
        "animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.3s_both] group overflow-hidden transition-colors hover:bg-white/[0.03] border-white/5 border rounded-2xl pt-8 pr-8 pb-8 pl-8 relative",
      badgeClassName: accentBadge,
      actionClassName: outlineAction,
      hasHoverTint: false,
      featherPhoto: true,
    },
    {
      name: "Buyer binds capital on Creditcoin",
      price: `${gross} mSET bound in escrow`,
      badge: "2 · Buyer",
      image: landingImages.tradeBuyer,
      screen: screens.buyerPhone,
      screenContent: <PhoneAmountScreen eyebrow="Bound" amount={gross} unit="mSET" accent />,
      action: `Escrow on ${chains.cc3.explorer}`,
      href: link("cc3", transactions?.fund),
      cardClassName:
        "animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.4s_both] group overflow-hidden bg-[#0F0F0F] border-white/10 border rounded-2xl pt-8 pr-8 pb-8 pl-8 relative shadow-2xl",
      badgeClassName: accentBadge,
      actionClassName:
        "w-full rounded-full bg-white py-2.5 text-xs font-semibold text-black transition-transform hover:scale-[1.02]",
      hasHoverTint: true,
      featherPhoto: false,
    },
    {
      name: "Seller receives, net of fee",
      price: `${net} mSET after ${fee} fee`,
      badge: "3 · Seller",
      image: landingImages.tradeSeller,
      screen: screens.sellerPhone,
      screenContent: <PhoneAmountScreen eyebrow="Pending" amount={net} unit="mSET" />,
      action: `Assignment on ${chains.sepolia.explorer}`,
      href: link("sepolia", transactions?.assign),
      cardClassName:
        "animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.5s_both] group relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.01] p-8 transition-colors hover:bg-white/[0.03]",
      badgeClassName: "text-[10px] font-bold uppercase tracking-widest text-neutral-600",
      actionClassName: outlineAction,
      hasHoverTint: false,
      featherPhoto: true,
    },
  ];
}
