"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Fade + rise on every route change: re-keys its children by pathname so `page-in` replays.
 * Use inside a layout around `{children}` (or as `app/template.tsx`'s body). Off under reduced motion.
 */
export function PageTransition({ children, className = "" }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className={className} style={{ animation: "page-in .45s var(--ease-out) both" }}>
      {children}
    </div>
  );
}
