"use client";
import { BackdropPortal } from "@/components/site/BackdropPortal";
import { SkyBackdrop } from "@/components/ui";

/** The living sky behind the dashboard (time-of-day tint, parallax), dimmed so cards read. */
export function HomeBackdrop() {
  return (
    <BackdropPortal>
      <SkyBackdrop variant="auto" intensity={0.6} />
    </BackdropPortal>
  );
}
