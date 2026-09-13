import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Building03Icon,
  CheckmarkBadge01Icon,
  UserIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";

const categories: readonly { label: string; icon: IconSvgElement; href: string }[] = [
  { label: "Payer / Treasury", icon: Building03Icon, href: "#how-it-works" },
  { label: "Seller / Recipient", icon: UserIcon, href: "#how-it-works" },
  { label: "Liquidity buyer", icon: Wallet01Icon, href: "#how-it-works" },
  { label: "Keyless verifier", icon: CheckmarkBadge01Icon, href: "#verify" },
];

export function CategoryPills() {
  return (
    <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.7s_both] mb-24">
      <div className="flex flex-wrap gap-3 md:gap-4 justify-center">
        {categories.map(({ label, icon, href }) => (
          <a
            key={label}
            href={href}
            className="group flex items-center gap-2 md:gap-3 rounded-full border border-white/5 bg-white/[0.02] px-4 py-2.5 md:px-6 md:py-3 hover:bg-white/[0.05] transition-colors"
          >
            <HugeiconsIcon
              icon={icon}
              size={16}
              className="text-neutral-400 group-hover:text-red-500 transition-colors"
            />
            <span className="text-xs md:text-sm text-neutral-300">{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
