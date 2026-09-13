"use client";

import Link from "next/link";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { rolesFor } from "@/lib/chain/deployments";
import { dashboardRoutes } from "@/lib/dashboard-routes";
import { landingImages } from "../../landing/landing-images";
import { CoverPhoto } from "../../landing/screens/cover-photo";
import { useWallet } from "../wallet/wallet-provider";

export function PositionTeaser() {
  const wallet = useWallet();
  const roles = wallet.status === "connected" && wallet.address ? rolesFor(wallet.address) : [];
  const headline =
    wallet.status !== "connected"
      ? "See what your wallet can do"
      : roles.length > 0
        ? `You hold the ${roles.join(" and ")} role`
        : "Your wallet is an observer";

  return (
    <Link
      href={dashboardRoutes.position}
      className="col-span-1 md:col-span-2 relative min-h-[280px] rounded-2xl overflow-hidden border border-white/5 group"
    >
      <CoverPhoto
        image={landingImages.lensVerifier}
        sizes="(min-width: 1024px) 50vw, 100vw"
        frameClassName=""
        motionClassName="transition-transform duration-700 group-hover:scale-105"
        imageClassName="opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />
      <div className="relative z-10 p-6 lg:p-8 flex flex-col justify-center h-full md:max-w-[65%] gap-3">
        <span className="inline-block px-2 py-1 rounded bg-[#FF5A36]/10 text-[#FF5A36] text-[10px] font-semibold tracking-wider uppercase w-fit border border-[#FF5A36]/30">
          Your position
        </span>
        <h3 className="text-2xl font-medium text-white">{headline}</h3>
        <p className="text-sm text-neutral-400 font-light">
          Roles, claimable credits and withdrawals for the connected wallet, read live on
          Creditcoin.
        </p>
        <span className="flex items-center gap-2 text-white text-xs font-medium group-hover:underline underline-offset-4">
          Open position <HugeiconsIcon icon={ArrowRight02Icon} size={12} />
        </span>
      </div>
    </Link>
  );
}
