"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Mode screens are full-bleed: no site header over a Run, a Reveal or the Dive playground.
const FULL_BLEED = [/^\/runs\//, /^\/styleguide\/dive/];

/** The sticky site header shell. Hidden on Mode screens. The full nav is F19 (#32). */
export function SiteHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (FULL_BLEED.some((re) => re.test(pathname))) return null;
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">{children}</div>
    </header>
  );
}
