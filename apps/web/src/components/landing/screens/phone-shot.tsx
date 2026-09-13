import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

export function PhoneShot({
  image,
  feather,
  children,
}: {
  image: StaticImageData;
  feather: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="relative h-full drop-shadow-2xl [container-type:size]"
      style={{ aspectRatio: `${String(image.width)} / ${String(image.height)}` }}
    >
      <Image
        src={image}
        alt=""
        fill
        sizes="240px"
        placeholder="blur"
        className={`object-contain rounded-xl ${feather ? "[mask-image:radial-gradient(ellipse_at_center,black_45%,transparent_72%)]" : ""}`}
      />
      {children}
    </div>
  );
}
