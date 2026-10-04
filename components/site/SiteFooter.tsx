"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, PixelIcon } from "@/components/ui";
import { isFullBleed } from "./nav-types";

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Play",
    links: [
      { href: "/daily", label: "Daily Dive" },
      { href: "/explore", label: "Explore courses" },
      { href: "/leaderboard", label: "Leaderboards" },
    ],
  },
  {
    title: "You",
    links: [
      { href: "/modules", label: "My Modules" },
      { href: "/profile", label: "Profile" },
      { href: "/friends", label: "Friends" },
    ],
  },
];

/** Site footer with a pixel seabed edge. Hidden on Mode screens. */
export function SiteFooter() {
  const pathname = usePathname();
  if (isFullBleed(pathname)) return null;
  return (
    <footer className="relative mt-16 border-t border-border bg-bg-2/90 backdrop-blur">
      <Seabed />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <Logo size="sm" />
          <p className="mt-3 max-w-xs text-sm text-muted">Turn your notes into games. Rarer answers sink deeper.</p>
          <p className="mt-4 text-xs text-faint">
            Built at StormHacks 2026 with Tiger Data (Postgres + TimescaleDB), Google Gemini and Clerk.
          </p>
        </div>
        {COLUMNS.map((c) => (
          <div key={c.title}>
            <h2 className="font-display text-sm tracking-[0.2em] text-faint uppercase">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted transition hover:text-signal">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 border-t border-border/60 px-4 py-4 text-xs text-faint sm:px-6">
        <span>© 2026 SYLLABYSS · a StormHacks 2026 project</span>
        <span className="flex items-center gap-1.5" title="There's a secret up there somewhere">
          <PixelIcon name="fish" size={14} /> ↑ ↑ ↓ ↓ ← → ← → B A
        </span>
      </div>
    </footer>
  );
}

/** A strip of pixel sand, rocks and kelp along the top edge of the footer. */
function Seabed() {
  const kelp = [6, 22, 47, 71, 93, 118, 140, 163, 188];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 10"
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className="pointer-events-none absolute inset-x-0 -top-[14px] h-[14px] w-full"
    >
      {kelp.map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 2 : 0} width="1.2" height={i % 2 ? 8 : 10} fill="#1f6b5a" opacity=".8" />
      ))}
      {[14, 58, 101, 150, 176].map((x) => (
        <rect key={x} x={x} y="6" width="6" height="4" fill="#2a3358" />
      ))}
    </svg>
  );
}
