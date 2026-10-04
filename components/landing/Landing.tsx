"use client";
import { Hero } from "./Hero";
import { LandingWorld } from "./LandingWorld";
import { DailyTeaserSection, ExploreTeaser, FooterCta, HowItWorks, ModesShowcase, SocialPreview, WhyItSticks } from "./Sections";
import type { DailyTeaser } from "./daily-teaser";

/**
 * The signed-out landing page (decisions §9, §14): a scroll story that starts in the sky and
 * descends to the seabed, with each section surfacing like a catch as you reach it.
 */
export function Landing({ teaser }: { teaser: DailyTeaser }) {
  return (
    <main className="relative flex-1 overflow-x-clip">
      <LandingWorld />
      <Hero />
      <HowItWorks />
      <ModesShowcase />
      <ExploreTeaser />
      <DailyTeaserSection teaser={teaser} />
      <WhyItSticks />
      <SocialPreview endDay={teaser.day} />
      <FooterCta />
    </main>
  );
}
