import Image from "next/image";
import wordmark from "@/assets/morrow-wordmark.png";

export function SiteLogo({ preload = false }: { preload?: boolean }) {
  return (
    <a
      href="#top"
      aria-label="Morrow home"
      className="inline-flex items-center justify-center h-[36px]"
    >
      <Image src={wordmark} alt="Morrow" preload={preload} className="h-[18px] w-auto" />
    </a>
  );
}
