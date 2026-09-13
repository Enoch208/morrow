import type { IconSvgElement } from "@hugeicons/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, LockIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";

const features: readonly { title: string; description: string; icon: IconSvgElement }[] = [
  {
    title: "Reservation comes first",
    description:
      "The buyer deposits only after the exact source reservation is verified on Creditcoin.",
    icon: LockIcon,
  },
  {
    title: "No timeout refunds",
    description: "Bound funds move only on a matching source assignment or cancellation proof.",
    icon: Clock01Icon,
  },
  {
    title: "Seller preflight",
    description:
      "The source chain cannot read Creditcoin, so the official client confirms the funded escrow before the seller signs.",
    icon: SecurityCheckIcon,
  },
];

export function PrecisionFeatures() {
  return (
    <ul className="mt-8 space-y-6">
      {features.map(({ title, description, icon }) => (
        <li key={title} className="flex items-start gap-4">
          <span className="mt-1 h-8 w-8 rounded-lg bg-white/5 ring-1 ring-white/10 grid place-items-center text-white shrink-0">
            <HugeiconsIcon icon={icon} size={16} />
          </span>
          <div>
            <div className="text-sm font-medium text-white">{title}</div>
            <div className="text-sm text-neutral-500 mt-1">{description}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
