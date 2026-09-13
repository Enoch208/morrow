import type { StaticImageData } from "next/image";
import { CoverPhoto } from "./screens/cover-photo";

interface MaterialTileProps {
  image: StaticImageData;
  title: string;
  caption: string;
  headingClassName: string;
}

export function MaterialTile({ image, title, caption, headingClassName }: MaterialTileProps) {
  return (
    <div className="animate-on-scroll [animation:fadeInUp_0.8s_ease-out_0.7s_both] col-span-1 md:col-span-1 min-h-[280px] md:min-h-0 overflow-hidden group bg-[#0A0A0A] border-white/5 border rounded-3xl relative hover:border-red-500/20 transition-colors">
      <CoverPhoto
        image={image}
        sizes="(min-width: 768px) 25vw, 100vw"
        frameClassName=""
        motionClassName=""
        imageClassName="group-hover:opacity-100 transition-opacity duration-700 opacity-40"
      />
      <div className="bg-gradient-to-t from-black via-transparent to-transparent absolute top-0 right-0 bottom-0 left-0" />
      <div className="absolute bottom-6 w-full text-center p-4">
        <h3 className={headingClassName}>{title}</h3>
        <p className="text-[10px] text-neutral-500">{caption}</p>
      </div>
    </div>
  );
}
