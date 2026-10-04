"use client";
import { SignInButton } from "@clerk/nextjs";
import Link from "next/link";
import type { ReactNode } from "react";
import { TIER_ORDER, TIER_UI } from "@/components/modes/dive/tiers";
import { ShareButton } from "@/components/daily/ShareButton";
import { TierSquares } from "@/components/daily/TierSquares";
import { metres } from "@/components/daily/format";
import { Odometer, PixelIcon } from "@/components/ui";
import type { DailyToday, Leaderboard } from "@/lib/daily/types";
import { TIER_POINTS } from "@/lib/scoring/tiers";
import { usePlay } from "./play";

/** The big Krillion-style CTA (accent two-ring, bobbing). */
function DiveButton({ children, onClick, pending, as = "button", href }: { children: ReactNode; onClick?: () => void; pending?: boolean; as?: "button" | "link"; href?: string }) {
  const className =
    "inline-flex min-h-14 w-full items-center justify-center px-6 py-3 font-hud text-[26px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] disabled:opacity-60 sm:w-auto sm:px-10 sm:text-[30px]";
  const style = {
    background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
    boxShadow: "inset 0 0 0 3px var(--accent), 0 0 26px color-mix(in srgb, var(--accent) 45%, transparent), 0 5px 0 #3b0f22",
    animation: pending ? undefined : "btn-bob 2.4s ease-in-out infinite",
  };
  if (as === "link" && href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={pending} className={className} style={style}>
      {children}
    </button>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 flex-1 px-3 py-2" style={{ boxShadow: "inset 0 0 0 1px var(--dive-rim, #1b3050)" }}>
      <p className="font-hud text-[13px] tracking-[0.14em] whitespace-nowrap text-muted">{label}</p>
      <div className="font-hud text-[26px] leading-tight text-text tabular-nums">{children}</div>
    </div>
  );
}

/** Today's puzzle: the teaser and DIVE IN, or your counted result with Share. */
export function TodayCard({ daily, board, betterThanPct }: { daily: DailyToday; board: Leaderboard | null; betterThanPct: number | null }) {
  const play = usePlay();
  const me = daily.me;
  const result = me?.result ?? null;

  return (
    <section id="today" aria-labelledby="today-title" data-theme="dive" className="dv-panel relative scroll-mt-24 overflow-hidden bg-surface p-5 sm:p-7" style={{ animation: "rise-in .5s var(--ease-out) both" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 90% -10%, rgba(255,138,106,.18), transparent 55%), radial-gradient(ellipse at 0% 120%, rgba(77,227,255,.14), transparent 55%)" }}
      />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="today-title" className="font-hud text-[20px] tracking-[0.25em] text-accent">
            TODAY&apos;S PUZZLE
          </h2>
          <span className="font-hud text-[16px] tracking-[0.2em] text-muted">PROMPT 1 OF {daily.promptCount}</span>
        </div>
        <p className="mt-4 font-hud text-[clamp(30px,6vw,44px)] leading-[1.05] text-text">{daily.teaser}</p>
        <p className="mt-2 font-hud text-[16px] tracking-[0.25em] text-signal">▼ RARER ANSWERS SINK DEEPER ▼</p>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Tiers">
          {TIER_ORDER.map((t) => (
            <li key={t} className="flex items-center gap-1.5 px-2 py-0.5 font-hud text-[15px] tracking-[0.1em]" style={{ color: TIER_UI[t].color, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${TIER_UI[t].hex} 45%, transparent)` }}>
              <PixelIcon name={TIER_UI[t].icon} size={12} palette={{ c: TIER_UI[t].hex, b: TIER_UI[t].hex, v: TIER_UI[t].hex, y: TIER_UI[t].hex }} />
              {TIER_UI[t].label.toUpperCase()} +{TIER_POINTS[t]}
            </li>
          ))}
        </ul>

        <div className="mt-6">
          {!me && (
            <div className="flex flex-col items-start gap-2">
              <SignInButton mode="modal" forceRedirectUrl="/daily">
                <DiveButton>▼ DIVE IN ▼</DiveButton>
              </SignInButton>
              <p className="font-sans text-sm text-muted">Sign in to play. It&apos;s free, and your first dive today counts.</p>
            </div>
          )}

          {me?.status === "not_played" && (
            <div className="flex flex-col items-start gap-2">
              <DiveButton onClick={play.today} pending={play.pending === "today"}>
                {play.pending === "today" ? "▼ DIVING… ▼" : "▼ DIVE IN ▼"}
              </DiveButton>
              <p className="font-sans text-sm text-muted">One counted dive per day. Replays after it are practice.</p>
            </div>
          )}

          {me?.status === "in_progress" && me.runId && (
            <div className="flex flex-col items-start gap-2">
              <DiveButton as="link" href={`/runs/${me.runId}`}>
                ▼ RESUME DIVE ▼
              </DiveButton>
              <p className="font-sans text-sm text-muted">Your dive is waiting where you left it. Finish it to put it on the board.</p>
            </div>
          )}

          {me?.status === "counted" && result && (
            <div className="flex flex-col gap-4" style={{ animation: "rise-in .5s var(--ease-out) .1s both" }}>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-hud text-[15px] tracking-[0.25em] text-success">
                    <PixelIcon name="check" size={14} /> TODAY&apos;S DIVE · COUNTED
                  </p>
                  <p className="font-hud text-[clamp(52px,12vw,76px)] leading-none text-reward tabular-nums" style={{ textShadow: "0 0 18px color-mix(in srgb, var(--reward) 45%, transparent)" }}>
                    <Odometer value={result.score} format={metres} />
                  </p>
                </div>
                <TierSquares tiers={result.tiers} size={28} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Stat label="RANK">{board?.me ? `#${board.me.place}` : "—"}<span className="ml-1 text-[16px] text-muted">of {Math.max(board?.total ?? 0, daily.players)}</span></Stat>
                <Stat label="BETTER THAN">{betterThanPct === null || daily.players <= 1 ? "—" : `${betterThanPct}%`}</Stat>
                <Stat label="SCORE">{result.score}<span className="ml-1 text-[16px] text-muted">pts</span></Stat>
              </div>
              <pre className="overflow-x-auto bg-[#060d1a] px-3 py-2 font-hud text-[18px] leading-snug whitespace-pre-wrap text-text" style={{ boxShadow: "inset 0 0 0 1px var(--dive-rim, #1b3050)" }} aria-label="Your share text">
                {result.shareText}
              </pre>
              <div className="flex flex-wrap items-center gap-3">
                <ShareButton text={result.shareText} look="dive" />
                <Link href={`/runs/${result.runId}/reveal`} className="px-4 py-2.5 font-hud text-[20px] tracking-[0.2em] text-muted transition hover:text-signal" style={{ boxShadow: "inset 0 0 0 1px var(--dive-rim, #1b3050)" }}>
                  SEE YOUR CATCH ▸
                </Link>
                <button type="button" onClick={play.today} disabled={!!play.pending} className="px-4 py-2.5 font-hud text-[20px] tracking-[0.2em] text-muted transition hover:text-accent disabled:opacity-60">
                  {play.pending === "today" ? "DIVING…" : "PRACTICE DIVE ▼"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
