import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkBadge01Icon } from "@hugeicons/core-free-icons";
import type { ClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { chains, transactionUrl } from "@/lib/explorers";
import { landingImages } from "./landing-images";
import { CoverPhoto } from "./screens/cover-photo";
import { ProofScreen } from "./screens/proof-screen";
import { screens } from "./screens/screen-geometry";
import { ScreenSurface } from "./screens/screen-surface";

const thumbnails = [
  { image: landingImages.thumbVault, key: "vault" },
  { image: landingImages.thumbClock, key: "deadline" },
] as const;

export function PrecisionGallery({ evidence }: { evidence: ClaimAEvidence }) {
  const reserveHash =
    evidence.status === "available" ? evidence.snapshot.transactions.reserve : undefined;

  return (
    <div id="verify" className="relative scroll-mt-32">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-tr from-red-500/10 via-neutral-500/5 to-white/5 blur-2xl opacity-50" />

      <div className="relative rounded-2xl border border-white/10 bg-[#0A0A0A] p-3 shadow-2xl">
        <div className="rounded-xl overflow-hidden relative group">
          <div className="relative w-full h-[360px] sm:h-[420px]">
            <CoverPhoto
              image={landingImages.galleryProof}
              sizes="(min-width: 1024px) 45vw, 100vw"
              frameClassName=""
              motionClassName="transition-transform duration-700 group-hover:scale-105"
              imageClassName="opacity-80 group-hover:opacity-100 transition-opacity duration-700"
            >
              <ScreenSurface geometry={screens.proofTablet}>
                <ProofScreen evidence={evidence} />
              </ScreenSurface>
            </CoverPhoto>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur-md p-3 rounded-lg border border-white/10">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white">
                <HugeiconsIcon icon={CheckmarkBadge01Icon} size={20} />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Native Attestcoin proof</div>
                <div className="text-xs text-neutral-400">Verified on Creditcoin CC3 testnet</div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          {thumbnails.map(({ image, key }) => (
            <div
              key={key}
              className="relative h-24 w-full overflow-hidden rounded-lg border border-white/10 group cursor-pointer"
            >
              <Image
                src={image}
                sizes="160px"
                placeholder="blur"
                alt=""
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110 opacity-60 group-hover:opacity-100"
              />
            </div>
          ))}
          <a
            href={reserveHash ? transactionUrl("sepolia", reserveHash) : "#safety"}
            target="_blank"
            rel="noreferrer"
            className="relative h-24 w-full overflow-hidden rounded-lg border border-white/10 group"
          >
            <div className="absolute inset-0 bg-white/5 flex flex-col items-center justify-center gap-1 text-white group-hover:bg-white/10 transition-colors">
              <span className="text-xs font-medium">Source tx</span>
              <span className="text-[10px] text-neutral-500">{chains.sepolia.explorer}</span>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
