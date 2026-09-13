import { loadClaimAEvidence } from "@/lib/evidence/claim-a-snapshot";
import { BackgroundEffects } from "@/components/landing/background-effects";
import { CategoryPills } from "@/components/landing/category-pills";
import { CuratedSelections } from "@/components/landing/curated-selections";
import { Hero } from "@/components/landing/hero";
import { HeroShowcase } from "@/components/landing/hero-showcase";
import { MaterialInnovation } from "@/components/landing/material-innovation";
import { PrecisionDetails } from "@/components/landing/precision-details";
import { ScrollReveal } from "@/components/landing/scroll-reveal";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { WavelengthSection } from "@/components/landing/wavelength-section";

export default function HomePage() {
  const evidence = loadClaimAEvidence();

  return (
    <div className="relative min-h-screen overflow-x-hidden pt-32">
      <BackgroundEffects />
      <SiteNav />
      <main id="top" className="max-w-7xl mr-auto ml-auto pt-12 pr-6 pb-32 pl-6 relative">
        <Hero evidence={evidence} />
        <HeroShowcase evidence={evidence} />
        <CategoryPills />
        <CuratedSelections evidence={evidence} />
      </main>
      <MaterialInnovation evidence={evidence} />
      <PrecisionDetails evidence={evidence} />
      <WavelengthSection evidence={evidence} />
      <SiteFooter />
      <ScrollReveal />
    </div>
  );
}
