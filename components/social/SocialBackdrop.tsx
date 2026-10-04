"use client";
import { BackdropPortal } from "@/components/site/BackdropPortal";
import { SkyBackdrop, type SkyVariant } from "@/components/ui";

/** The living sky behind the social pages, dimmed so the cards read (same recipe as /home). */
export function SocialBackdrop({ variant = "auto", intensity = 0.5 }: { variant?: SkyVariant; intensity?: number }) {
  return (
    <BackdropPortal>
      <SkyBackdrop variant={variant} intensity={intensity} />
    </BackdropPortal>
  );
}
