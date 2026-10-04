// The dashboard's main column cards. Server components wrapping the F10 client kit.
import Link from "next/link";
import type { CSSProperties } from "react";
import { Button, Chip, ModeBadge, ModeScene, ProgressBar, StreakFlame, TiltCard } from "@/components/ui";
import tile from "@/components/ui/ModeTile.module.css";
import { formatDepth } from "@/components/modes/dive/tiers";
import { NextDailyCountdown } from "@/components/landing/Countdown";
import type { DailyTeaser } from "@/components/landing/daily-teaser";
import { TierSquares } from "@/components/daily/TierSquares";
import type { CourseSummary } from "@/lib/courses/types";
import type { DailyToday } from "@/lib/daily/types";
import type { Streak } from "@/lib/social/types";
import { modeUi } from "@/lib/ui/modes";
import { CourseProgress } from "./CourseProgress";
import { EmptyJumpBackIn } from "./EmptyJumpBackIn";
import type { HomeGame } from "./data";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function ago(iso: string | null): string {
  if (!iso) return "not played yet";
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [604800, "day"],
    [2629800, "week"],
    [Infinity, "month"],
  ];
  const div = [1, 60, 3600, 86400, 604800, 2629800];
  for (let i = 0; i < steps.length; i++) {
    if (Math.abs(s) < steps[i][0]) return `played ${rtf.format(Math.round(s / div[i]), steps[i][1])}`;
  }
  return "played a while ago";
}

/** Personal Best in the Mode's metaphor: Dive shows depth (10 m per point). */
function best(game: HomeGame): string {
  if (game.finishedRuns === 0) return "—";
  return game.mode === "dive" ? formatDepth(game.personalBest) : `${game.personalBest.toLocaleString("en-US")} pts`;
}

function playTarget(game: HomeGame): { href: string; label: string } {
  if (game.inProgressRunId) return { href: `/runs/${game.inProgressRunId}`, label: "Resume run" };
  const m = modeUi(game.mode);
  return { href: `/games/${game.id}`, label: game.finishedRuns > 0 ? "Play again" : m.verb.charAt(0) + m.verb.slice(1).toLowerCase() };
}

/** The big banner for the most recent Game: its Mode's live mini-scene, Mastery and Play. */
export function JumpBackIn({ game, hasModules }: { game: HomeGame | null; hasModules: boolean }) {
  if (!game) return <EmptyJumpBackIn hasModules={hasModules} />;
  const m = modeUi(game.mode);
  const play = playTarget(game);
  return (
    <TiltCard max={5}>
      <div className="grid bg-surface/95 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* data-selected keeps the mini-scene looping (ModeTile's CSS) */}
        <div className={`${tile.tile} relative aspect-[5/3] md:aspect-auto md:min-h-[240px]`} data-selected="true">
          <div className="absolute inset-0">
            <ModeScene mode={m.id} />
          </div>
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-surface/80 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-surface/90" />
          <span className="absolute top-3 left-3">
            <ModeBadge mode={m.id} />
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-3 p-5">
          <p className="truncate text-sm text-muted">
            <Link href={`/modules/${game.moduleId}`} className="hover:text-signal">
              {game.moduleName}
            </Link>{" "}
            · {ago(game.lastPlayedAt)}
          </p>
          <h3 className="line-clamp-2 text-2xl text-text">{game.title}</h3>
          <ProgressBar
            value={game.mastery.found}
            max={Math.max(1, game.mastery.total)}
            tone={m.accent}
            label={`Mastery · ${game.mastery.pct}%`}
            showValue={game.mastery.total > 0}
            height={12}
          />
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-faint">Personal Best</dt>
              <dd className="font-hud text-3xl leading-none text-reward">{best(game)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Runs finished</dt>
              <dd className="font-hud text-3xl leading-none text-text">{game.finishedRuns}</dd>
            </div>
          </dl>
          <div className="mt-auto pt-1">
            <Button href={play.href} variant="primary" iconRight="▶">
              {play.label}
            </Button>
          </div>
        </div>
      </div>
    </TiltCard>
  );
}

/** A smaller card for another recent Game. */
export function GameCard({ game, style }: { game: HomeGame; style?: CSSProperties }) {
  const m = modeUi(game.mode);
  return (
    <Link href={`/games/${game.id}`} style={style} className="card group flex flex-col gap-3 bg-surface/95 p-4" data-interactive="true">
      <div className="flex items-center justify-between gap-2">
        <ModeBadge mode={m.id} />
        <span className="text-xs text-faint">{ago(game.lastPlayedAt)}</span>
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-lg text-text group-hover:text-signal">{game.title}</h3>
        <p className="truncate text-sm text-muted">{game.moduleName}</p>
      </div>
      <ProgressBar value={game.mastery.found} max={Math.max(1, game.mastery.total)} tone={m.accent} label={`Mastery · ${game.mastery.pct}%`} height={8} />
      <p className="text-sm text-muted">
        Best <span className="font-hud text-xl text-reward">{best(game)}</span>
      </p>
    </Link>
  );
}

/**
 * Today's Daily Dive (F28): the first Prompt and Dive in, Resume, or your counted result
 * (depth + share grid). Falls back to the teaser when there's no puzzle today.
 */
export function DailyCard({ teaser, daily, streak, style }: { teaser: DailyTeaser; daily: DailyToday | null; streak: Streak; style?: CSSProperties }) {
  const me = daily?.me ?? null;
  const result = me?.result ?? null;
  const dailyStreak = me?.dailyStreak ?? streak;
  const cta =
    me?.status === "counted"
      ? { href: "/daily", label: "Your dive" }
      : me?.status === "in_progress" && me.runId
        ? { href: `/runs/${me.runId}`, label: "Resume" }
        : { href: "/daily", label: "Dive in" };
  return (
    <TiltCard max={6} className="sm:col-span-2">
      <div style={style} data-theme="dive" className="relative flex flex-col gap-4 overflow-hidden bg-surface p-5 sm:flex-row sm:items-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(ellipse at 85% 120%, rgba(77,227,255,.25), transparent 60%), radial-gradient(ellipse at 100% -20%, rgba(255,138,106,.22), transparent 55%), linear-gradient(180deg, transparent, rgba(5,10,20,.6))" }}
        />
        <div className="relative min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg tracking-[0.16em] text-accent">DAILY DIVE #{daily?.number ?? teaser.number}</span>
            {me?.status === "counted" ? <Chip tone="success">Done today</Chip> : me?.status === "in_progress" ? <Chip tone="caution">In progress</Chip> : <Chip tone="signal">Today</Chip>}
            {daily && <span className="text-xs text-muted">{daily.theme}</span>}
          </div>
          {result ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="font-hud text-4xl leading-none text-reward">{formatDepth(result.score)}</span>
              <TierSquares tiers={result.tiers} size={16} animate={false} className="gap-1" />
            </div>
          ) : (
            <p className="mt-2 line-clamp-2 font-display text-2xl leading-tight text-text">
              {daily ? daily.teaser : teaser.isSample ? "Seven prompts, one counted dive, the same puzzle for everyone." : teaser.prompt}
            </p>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <StreakFlame days={dailyStreak.current} active={dailyStreak.playedToday} size={18} showCount={false} />
            {me && dailyStreak.current > 0 && <span>{dailyStreak.current}-day Daily streak ·</span>}
            Next puzzle in <NextDailyCountdown className="text-xl text-reward" />
          </p>
        </div>
        <div className="relative shrink-0">
          <Button href={cta.href} variant="primary" iconRight="▼">
            {cta.label}
          </Button>
        </div>
      </div>
    </TiltCard>
  );
}

/** Course progress (F22): one card per Course, from listCourses. */
export function CourseProgressCard({ course }: { course: CourseSummary }) {
  return <CourseProgress course={course} />;
}

