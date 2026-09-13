import { landingImages } from "../../landing/landing-images";
import { CoverPhoto } from "../../landing/screens/cover-photo";
import { PositionCard } from "./position-card";

export function PositionBanner() {
  return (
    <div className="col-span-1 md:col-span-2 relative min-h-[280px] rounded-2xl overflow-hidden border border-white/5">
      <CoverPhoto
        image={landingImages.lensVerifier}
        sizes="(min-width: 1024px) 50vw, 100vw"
        frameClassName=""
        motionClassName=""
        imageClassName="opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/70 to-transparent" />
      <PositionCard />
    </div>
  );
}
