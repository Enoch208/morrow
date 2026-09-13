import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

interface CoverPhotoProps {
  image: StaticImageData;
  sizes: string;
  preload?: boolean;
  focusX?: number;
  frameClassName: string;
  motionClassName: string;
  imageClassName: string;
  children?: ReactNode;
}

export function CoverPhoto({
  image,
  sizes,
  preload = false,
  focusX = 0.5,
  frameClassName,
  motionClassName,
  imageClassName,
  children,
}: CoverPhotoProps) {
  const ratio = image.width / image.height;

  return (
    <div className={`absolute inset-0 overflow-hidden [container-type:size] ${frameClassName}`}>
      <div
        className={`absolute top-1/2 -translate-y-1/2 ${motionClassName}`}
        style={{
          left: `calc((100cqw - max(100cqw, calc(100cqh * ${String(ratio)}))) * ${String(focusX)})`,
          width: `max(100cqw, calc(100cqh * ${String(ratio)}))`,
          height: `max(100cqh, calc(100cqw / ${String(ratio)}))`,
        }}
      >
        <Image
          src={image}
          alt=""
          fill
          sizes={sizes}
          preload={preload}
          placeholder="blur"
          className={`object-cover ${imageClassName}`}
        />
        {children}
      </div>
    </div>
  );
}
