"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Fade + rise on every route change (the `page-in` keyframe), keyed by pathname. Unlike a
 * filled animation, the animation is removed once it ends, so no transform lingers on the
 * wrapper (a transformed ancestor would trap `position: fixed` children such as modals).
 * Off under reduced motion (the global rule collapses it to ~0 ms).
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div
      key={pathname}
      className="flex flex-1 flex-col"
      style={{ animation: "page-in .45s var(--ease-out) backwards" }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.style.animation = "none";
      }}
    >
      {children}
    </div>
  );
}
