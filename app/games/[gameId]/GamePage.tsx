"use client";
// The Game page: the site frame (hero band, title, ModeBadge, source chips, created date),
// the Mode's stats panel and Play wording, recent Runs and the charts. Spec: ui-map.md § Game page.
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApogeeGameStats } from "@/components/modes/apogee/GameStats";
import { BlitzGameStats } from "@/components/modes/blitz/GameStats";
import { DiveGameStats } from "@/components/modes/dive/GameStats";
import { LeapGameStats } from "@/components/modes/leap/GameStats";
import { PairsGameStats } from "@/components/modes/pairs/GameStats";
import { Chip } from "@/components/ui/Chip";
import { Mascot, type MascotHandle } from "@/components/ui/Mascot";
import { ModeBadge } from "@/components/ui/ModeTile";
import { Panel } from "@/components/ui/Panel";
import { PageTransition } from "@/components/ui/PageTransition";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SkyBackdrop } from "@/components/ui/SkyBackdrop";
import { StatusPill } from "@/components/ui/StatusPill";
import { MODES } from "@/lib/modes";
import { modeUi, type ModeUiId } from "@/lib/ui/modes";
import { AccuracyChart } from "./AccuracyChart";
import { GameHero } from "./GameHero";
import { lumenLine, wordsFor, type GamePageData } from "./model";
import { PlayButton } from "./PlayButton";
import { RecentRuns } from "./RecentRuns";
import { ScoreHistory } from "./ScoreHistory";

const created = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Vancouver" });

export function GamePage({ data }: { data: GamePageData }) {
  const { game, topic } = data;
  const [launching, setLaunching] = useState(false);
  const mascot = useRef<MascotHandle>(null);
  const words = wordsFor(game.mode);
  const ui = modeUi(game.mode);
  const ready = game.status === "ready";

  const back = topic
    ? { href: `/explore/${topic.courseSlug}/${topic.slug}`, label: `Topic ${topic.number} · ${topic.title}` }
    : game.module
      ? { href: `/modules/${game.module.id}`, label: game.module.name }
      : game.isPublic
        ? { href: "/explore", label: "Explore" }
        : { href: "/modules", label: "My Modules" };

  const lastWasBest = data.runs.length > 0 && data.personalBest > 0 && data.runs[0].score === data.personalBest;
  const line = lumenLine({
    mode: game.mode,
    runCount: data.runCount,
    masteryPct: data.mastery.pct,
    lastWasBest,
    locked: topic?.locked,
  });

  return (
    <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-16 sm:px-6">
      <SkyBackdrop variant="night" intensity={0.55} sea={false} />
      <PageTransition>
        <Link
          href={back.href}
          className="group mb-3 inline-flex max-w-full items-center gap-2 text-sm text-muted transition-colors hover:text-text"
        >
          <span className="transition-transform group-hover:-translate-x-1" aria-hidden="true">
            ←
          </span>
          <span className="truncate">{back.label}</span>
        </Link>

        <GameHero mode={game.mode} launching={launching}>
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={game.mode as ModeUiId} />
            {topic && (
              <Chip tone="violet" icon={<PixelIcon name="book" size={12} />}>
                {topic.courseTitle} · Topic {topic.number}
              </Chip>
            )}
            {game.isPublic && !topic && <Chip tone="signal">Public</Chip>}
          </div>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold text-balance text-white drop-shadow-[0_2px_0_rgba(0,0,0,.6)] sm:text-[40px]">
            {game.title}
          </h1>
          <p className="mt-1 text-sm text-[#c9d3ec]">
            {MODES[game.mode]?.tagline ?? ui.tagline}
            <span className="mx-2 opacity-50">·</span>
            {game.promptCount ? `${game.promptCount} prompts · ` : ""}
            Made {created(game.createdAt)}
          </p>
        </GameHero>

        {game.sources.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Source files">
            {game.sources.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/modules/${game.module?.id ?? ""}?doc=${f.id}`}
                  className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-sm border border-border bg-surface px-2 py-1 text-[13px] text-text transition duration-200 hover:-translate-y-0.5 hover:border-signal hover:text-signal"
                >
                  <PixelIcon name="doc" size={14} />
                  <span className="truncate">{f.filename}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {!ready ? (
          <NotReady data={data} backHref={back.href} />
        ) : (
          <>
            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
              <div className="grid content-start gap-4">
                <ModeStats data={data} />
                {topic && (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-4 py-3 text-sm">
                    <span className="font-display tracking-wide text-muted">PASS BAR</span>
                    <span className="text-text">{topic.passBar}</span>
                    {topic.passed ? (
                      <Chip tone="success" icon={<PixelIcon name="check" size={12} />}>
                        Passed
                      </Chip>
                    ) : topic.locked ? (
                      <Chip tone="caution" icon={<PixelIcon name="lock" size={12} />}>
                        Locked
                      </Chip>
                    ) : null}
                  </div>
                )}
                <div
                  className="relative"
                  onMouseEnter={() => mascot.current?.react("wow")}
                >
                  <PlayButton
                    gameId={game.id}
                    label={words.play}
                    accent={ui.accent}
                    topic={topic}
                    backHref={back.href}
                    onLaunch={(on) => {
                      setLaunching(on);
                      if (on) mascot.current?.react("happy");
                    }}
                  />
                </div>
              </div>

              <div className="grid content-start gap-4">
                <div className="flex items-end gap-3">
                  <div className="shrink-0">
                    <Mascot ref={mascot} size={72} followCursor sleepAfterMs={45000} />
                  </div>
                  <p
                    key={line}
                    className="relative mb-6 flex-1 animate-pop-in rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-[15px] leading-snug text-text shadow-lg before:absolute before:bottom-3 before:-left-[7px] before:h-3 before:w-3 before:rotate-45 before:border-b before:border-l before:border-border-strong before:bg-surface-2"
                  >
                    {line}
                  </p>
                </div>
                <Panel title={`Recent ${words.runs}`}>
                  <RecentRuns runs={data.runs} words={words} best={data.personalBest} />
                </Panel>
              </div>
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Panel title="Your scores">
                <ScoreHistory runs={data.runs} score={words.score} runWord={words.run} runsWord={words.runs} />
              </Panel>
              <Panel title="Accuracy over time">
                <AccuracyChart days={data.daily} />
              </Panel>
            </div>
          </>
        )}
      </PageTransition>
    </main>
  );
}

function ModeStats({ data }: { data: GamePageData }): ReactNode {
  const { game, personalBest, mastery, byTier, modeStats: m, runCount } = data;
  switch (game.mode) {
    case "apogee":
      return <ApogeeGameStats personalBest={personalBest} mastery={mastery} byTier={byTier} runs={runCount} />;
    case "leap":
      return (
        <LeapGameStats
          personalBest={personalBest}
          bestStreak={m.bestStreak}
          heartsLeft={m.heartsLeftOnBest}
          summits={m.summits}
          mastery={mastery}
          runs={runCount}
        />
      );
    case "pairs":
      return <PairsGameStats personalBest={personalBest} bestClearMs={m.bestClearMs} clears={m.clears} mastery={mastery} runs={runCount} />;
    case "blitz":
      return <BlitzGameStats personalBest={personalBest} bestCombo={m.bestCombo} bestCorrect={m.bestCorrect} mastery={mastery} runs={runCount} />;
    default:
      return <DiveGameStats personalBest={personalBest} mastery={mastery} byTier={byTier} runs={runCount} />;
  }
}

/** Generating (poll until it settles) or failed (show the error). Private Games only. */
function NotReady({ data, backHref }: { data: GamePageData; backHref: string }) {
  const router = useRouter();
  const { game } = data;
  const generating = game.status === "queued" || game.status === "generating";

  useEffect(() => {
    if (!generating) return;
    let stop = false;
    const id = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/games/${game.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { game: { status: string } };
        if (!stop && body.game.status !== game.status) router.refresh();
      } catch {
        /* keep polling */
      }
    }, 2500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [generating, game.id, game.status, router]);

  return (
    <section className="mt-6 grid place-items-center gap-4 rounded-lg border border-border bg-surface px-6 py-10 text-center" aria-live="polite">
      <Mascot size={96} mood={generating ? "wow" : "sad"} say={generating ? "Reading your notes… back in a moment!" : undefined} />
      <StatusPill status={generating ? "generating" : "failed"} />
      {generating ? (
        <p className="max-w-md text-muted">
          We&apos;re writing the Prompts and checking every Answer against your files. This page updates by itself when the Game is ready.
        </p>
      ) : (
        <>
          <p className="max-w-md text-text">{game.error ?? "Making this Game failed."}</p>
          <Link href={backHref} className="text-signal underline-offset-4 hover:underline">
            Back to the Module to try again →
          </Link>
        </>
      )}
    </section>
  );
}
