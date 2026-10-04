"use client";
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { SignUpButton } from "@clerk/nextjs";
import {
  Button, Chip, Heatmap, Mascot, ModeTile, PixelAvatar, PixelIcon, StreakFlame, TiltCard, type HeatDay, type PixelIconName,
} from "@/components/ui";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { addDays } from "@/lib/social/days";
import { NextDailyCountdown } from "./Countdown";
import { SHARE_SQUARES, type DailyTeaser } from "./daily-teaser";
import { PickModeArt, PlayArt, PythonBanner, UploadArt } from "./illustrations";
import { SectionTitle, Surface } from "./Surface";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

// ── 2. How it works ──────────────────────────────────────────────────────────

const STEPS: { title: string; body: string; art: ReactNode }[] = [
  {
    title: "Upload your slides",
    body: "Drop in lecture slides, PDFs or notes. We read every page so each game comes from your material.",
    art: <UploadArt />,
  },
  {
    title: "Pick a Game Mode",
    body: "Dive, Apogee, Leap, Pairs or Blitz. Same notes, a different way to pull them out of your head.",
    art: <PickModeArt />,
  },
  {
    title: "Play and remember",
    body: "Type what you know against the clock. Obvious answers score a little; the rare ones you dig up sink deeper.",
    art: <PlayArt />,
  },
];

export function HowItWorks() {
  return (
    <Surface id="how" zone="Sunlit zone" icon="fish" labelledBy="how-title" className="pt-10 pb-24">
      <SectionTitle id="how-title" kicker="How it works" title="Notes in. Games out." />
      <ol className="grid gap-5 md:grid-cols-3">
        {STEPS.map((step, n) => (
          <li key={step.title} data-catch style={i(n + 1)}>
            <TiltCard className="h-full">
              <div className="flex h-full flex-col bg-surface/90">
                <div className="aspect-[5/3] w-full overflow-hidden border-b border-border">{step.art}</div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <span className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-primary font-display text-primary">{n + 1}</span>
                    <h3 className="text-lg text-text">{step.title}</h3>
                  </span>
                  <p className="text-muted">{step.body}</p>
                </div>
              </div>
            </TiltCard>
          </li>
        ))}
      </ol>
    </Surface>
  );
}

// ── 3. Game Modes ────────────────────────────────────────────────────────────

const SHOWCASE: ModeUiId[] = ["dive", "apogee", "leap", "pairs", "blitz"];

const MODE_PITCH: Record<ModeUiId, string> = {
  dive: "Seven prompts, any answer that's in your notes. The rarer it is, the deeper you sink.",
  apogee: "Dive's rules in orbit: the rarer your answer, the higher the rocket climbs.",
  leap: "Multiple choice, one try each. Get it right and your hopper jumps to the next island.",
  pairs: "Match each term to its definition, two boards against a shared clock.",
  blitz: "Sixty seconds of true or false. Build a combo, keep the beat.",
  arena: "",
};

export function ModesShowcase() {
  const [mode, setMode] = useState<ModeUiId>("dive");
  const m = MODE_UI[mode];
  return (
    <Surface zone="Twilight zone" icon="jelly" labelledBy="modes-title" className="pb-24">
      <SectionTitle id="modes-title" kicker="Game Modes" title="Five ways to play the same notes">
        Hover a tile to watch it play. Pick one to read the rules.
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {SHOWCASE.map((id, n) => (
          <div key={id} data-catch style={i(n + 1)} className={n === 4 ? "col-span-2 sm:col-span-1" : undefined}>
            <ModeTile mode={id} selected={id === mode} onSelect={setMode} />
          </div>
        ))}
      </div>
      <div
        key={mode}
        aria-live="polite"
        className="mt-5 flex flex-col items-start gap-4 rounded-md border bg-surface/90 p-5 backdrop-blur sm:flex-row sm:items-center"
        style={{ borderColor: `color-mix(in srgb, ${m.accent} 50%, transparent)`, animation: "pop-in .35s var(--ease-snap) both" }}
      >
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md font-display text-2xl" style={{ background: `color-mix(in srgb, ${m.accent} 18%, transparent)`, color: m.accent }}>
          {m.icon}
        </span>
        <div className="flex-1">
          <p className="font-display text-lg" style={{ color: m.accent }}>
            {m.name} · {m.tagline}
          </p>
          <p className="text-muted">{MODE_PITCH[mode]}</p>
          <p className="mt-1 text-sm text-faint">{m.rules}</p>
        </div>
      </div>
    </Surface>
  );
}

// ── 4. Explore teaser ───────────────────────────────────────────────────────

const PYTHON_TOPICS = [
  "Hello World & Syntax",
  "Variables & Types",
  "Operators & Expressions",
  "Control Flow",
  "Loops",
  "Functions",
];

export function ExploreTeaser() {
  return (
    <Surface zone="Midnight zone" icon="lantern" labelledBy="explore-title" className="pb-24">
      <SectionTitle id="explore-title" kicker="Learn something new" title="No notes yet? Start a course.">
        Free courses with short readings and practice games in every Mode.
      </SectionTitle>
      <div data-catch style={i(1)} className="mx-auto max-w-3xl">
        <TiltCard max={6}>
          <Link href="/explore" className="grid bg-surface/95 sm:grid-cols-[1.1fr_1fr]">
            <div className="relative aspect-[5/2] sm:aspect-auto">
              <PythonBanner />
              <span className="absolute top-3 left-3 flex gap-2">
                <Chip tone="success">Beginner</Chip>
                <Chip tone="signal">6 Topics</Chip>
              </span>
            </div>
            <div className="flex flex-col gap-3 p-5">
              <p className="font-display text-sm tracking-[0.2em] text-faint uppercase">Course</p>
              <h3 className="text-2xl text-text">Python Basics</h3>
              <ol className="space-y-1.5 text-sm text-muted">
                {PYTHON_TOPICS.map((t, n) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-border-strong font-display text-[11px] text-text">{n + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              <span className="mt-auto inline-flex items-center gap-2 font-display text-signal">
                Explore courses <span aria-hidden="true">→</span>
              </span>
            </div>
          </Link>
        </TiltCard>
      </div>
    </Surface>
  );
}

// ── 5. Daily Dive teaser ─────────────────────────────────────────────────────

const BAND_TONE = { 1: "band-1", 2: "band-2", 3: "band-3", 4: "band-4" } as const;
const BAND_NAME = { 1: "Shallows", 2: "Reef", 3: "Abyss", 4: "Trench" } as const;
const EXAMPLE_ROW = [1, 2, 4, "miss", 3, 2, 1] as const;

export function DailyTeaserSection({ teaser }: { teaser: DailyTeaser }) {
  const share = `SYLLABYSS Daily #${teaser.number} · −1,400 m`;
  return (
    <Surface zone="Midnight zone" icon="clock" labelledBy="daily-title" className="pb-24">
      <SectionTitle id="daily-title" kicker="The Daily Dive" title="One puzzle a day. Same for everyone.">
        Seven prompts, a new set at midnight Vancouver time. Share your dive without spoiling the answers.
      </SectionTitle>
      <div className="grid items-start gap-5 md:grid-cols-[1.4fr_1fr]">
        <div data-catch style={i(1)} data-theme="dive" className="dv-panel relative overflow-hidden bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-xl tracking-[0.18em] text-accent">DAILY DIVE #{teaser.number}</span>
            <span className="font-display text-sm text-muted">PROMPT 1 OF 7</span>
          </div>
          <p className="mt-5 font-display text-[clamp(26px,4vw,34px)] leading-tight text-text">{teaser.prompt}</p>
          <p className="mt-2 font-display text-sm tracking-[0.2em] text-signal">▼ rarer answers sink deeper ▼</p>
          <Link
            href="/daily"
            className="mt-6 flex h-14 items-center justify-between gap-3 border-2 border-[var(--dive-rim,#1b3050)] bg-bg px-4 font-display text-xl text-faint transition hover:border-signal hover:text-muted"
          >
            <span>type one answer…</span>
            <span className="text-accent">DIVE ▼</span>
          </Link>
          {/* Only for the sample: never show the real puzzle's Answers. */}
          {teaser.isSample && (
            <div className="mt-5">
              <p className="mb-2 font-display text-sm text-muted">Some answers that count, by depth:</p>
              <ul className="flex flex-wrap gap-2">
                {teaser.examples.map((e) => (
                  <li key={e.answer}>
                    <Chip tone={BAND_TONE[e.tier]}>
                      {e.answer} · {BAND_NAME[e.tier]}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {teaser.isSample && <p className="mt-4 text-xs text-faint">Sample prompt. Today&apos;s real one is waiting on the Daily page.</p>}
        </div>

        <div data-catch style={i(2)} className="flex flex-col gap-4">
          <div className="card bg-surface/95 p-5">
            <p className="label-line">Share card · example</p>
            <pre className="mt-3 rounded-sm bg-bg-2 p-4 font-hud text-xl leading-snug whitespace-pre-wrap text-text">
              {share}
              {"\n"}
              {EXAMPLE_ROW.map((b) => SHARE_SQUARES[b]).join("")}
            </pre>
          </div>
          <div className="card flex items-center justify-between gap-3 bg-surface/95 p-5">
            <div>
              <p className="text-sm text-muted">Next Daily in</p>
              <NextDailyCountdown className="text-4xl text-reward" />
            </div>
            <Button href="/daily" variant="primary">
              Play today
            </Button>
          </div>
        </div>
      </div>
    </Surface>
  );
}

// ── 6. Why it sticks ─────────────────────────────────────────────────────────

const WHY: { icon: PixelIconName; title: string; body: string }[] = [
  {
    icon: "target",
    title: "Active recall",
    body: "Every round asks you to pull an answer out of memory instead of rereading it. That effort is the part that makes things stick.",
  },
  {
    icon: "clock",
    title: "Little and often",
    body: "A Daily Dive and a streak bring you back each day, and replaying a Game revisits the answers you haven't found yet.",
  },
  {
    icon: "doc",
    title: "Straight from your notes",
    body: "Every accepted answer links to the page it came from, so you can check the source instead of trusting a chatbot.",
  },
];

export function WhyItSticks() {
  return (
    <Surface zone="The abyss" icon="eye" labelledBy="why-title" className="pb-24">
      <SectionTitle id="why-title" kicker="Why it sticks" title="Built on how memory works" />
      <div className="grid gap-5 md:grid-cols-3">
        {WHY.map((w, n) => (
          <div key={w.title} data-catch style={i(n + 1)} className="card bg-surface/90 p-6 backdrop-blur">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-surface-2">
              <PixelIcon name={w.icon} size={28} />
            </span>
            <h3 className="mt-4 text-xl text-text">{w.title}</h3>
            <p className="mt-2 text-muted">{w.body}</p>
          </div>
        ))}
      </div>
      <div data-catch style={i(4)} className="mx-auto mt-6 max-w-2xl rounded-md border border-dashed border-border-strong bg-bg-2/85 px-4 py-3 text-sm text-muted">
        <span className="mr-2 inline-flex translate-y-0.5">
          <PixelIcon name="doc" size={14} />
        </span>
        <span className="text-faint">Example evidence: </span>
        Week 9 slides · p.41 — &ldquo;Mitochondria produce most of the cell&apos;s ATP through oxidative phosphorylation.&rdquo;
      </div>
    </Surface>
  );
}

// ── 7. Social ────────────────────────────────────────────────────────────────

/** Deterministic example activity for the heatmap preview (clearly labelled as an example). */
function exampleDays(endDay: string): HeatDay[] {
  let s = 42;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const days: HeatDay[] = [];
  for (let d = 0; d < 26 * 7; d++) {
    const date = addDays(endDay, -d);
    const v = r();
    const streaky = d < 12; // a recent streak
    if (streaky || v > 0.45) {
      const count = streaky ? 1 + Math.floor(r() * 4) : 1 + Math.floor(r() * 3);
      days.push({ date, count, xp: count * 35 });
    }
  }
  return days;
}

const EXAMPLE_BOARD = [
  { avatar: "axolotl", name: "axo_lotl", xp: 1240 },
  { avatar: "astronaut", name: "spacecadet", xp: 980 },
  { avatar: "anglerfish", name: "you", xp: 905, me: true },
  { avatar: "frog", name: "ribbit", xp: 610 },
];

export function SocialPreview({ endDay }: { endDay: string }) {
  const days = useMemo(() => exampleDays(endDay), [endDay]);
  return (
    <Surface zone="The abyss" icon="users" labelledBy="social-title" className="pb-24">
      <SectionTitle id="social-title" kicker="Better with friends" title="Streaks, friends and leaderboards">
        Your notes stay private. Your streak, level and badges don&apos;t have to.
      </SectionTitle>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
        <div className="flex flex-col gap-4">
          <div data-catch style={i(1)} className="card flex items-center gap-4 bg-surface/90 p-5">
            <StreakFlame days={12} size={44} showCount={false} />
            <div>
              <h3 className="text-lg text-text">Keep the flame lit</h3>
              <p className="text-sm text-muted">Finish one Run a day to grow your streak.</p>
            </div>
          </div>
          <div data-catch style={i(2)} className="card flex items-center gap-4 bg-surface/90 p-5">
            <div className="flex -space-x-3">
              {["cat", "octopus", "robot", "penguin"].map((a) => (
                <PixelAvatar key={a} id={a} size={40} className="ring-2 ring-surface" />
              ))}
            </div>
            <div>
              <h3 className="text-lg text-text">Add friends</h3>
              <p className="text-sm text-muted">Find them by username and see their profiles.</p>
            </div>
          </div>
          <div data-catch style={i(3)} className="card bg-surface/90 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg text-text">Weekly XP</h3>
              <span className="text-xs text-faint">Example board</span>
            </div>
            <ol className="mt-3 space-y-1.5">
              {EXAMPLE_BOARD.map((row, n) => (
                <li
                  key={row.name}
                  className={`flex items-center gap-3 rounded-sm px-2 py-1.5 ${row.me ? "bg-surface-2 ring-1 ring-primary/60" : ""}`}
                >
                  <span className="w-5 font-display text-faint">{n + 1}</span>
                  <PixelAvatar id={row.avatar} size={28} />
                  <span className="flex-1 truncate text-sm text-text">{row.name}</span>
                  <span className="font-hud text-lg text-reward">{row.xp.toLocaleString("en-US")} XP</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div data-catch style={i(4)} className="card min-w-0 bg-surface/90 p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-lg text-text">Your activity, on your profile</h3>
            <Chip tone="neutral">Example</Chip>
          </div>
          <Heatmap days={days} weeks={26} endDate={endDay} unit="runs" />
          <p className="mt-3 text-sm text-muted">Each square is a day. Play and it fills in, a little brighter for every Run.</p>
        </div>
      </div>
    </Surface>
  );
}

// ── 8. Footer CTA ────────────────────────────────────────────────────────────

export function FooterCta() {
  return (
    <Surface zone="The trench" icon="lantern" labelledBy="cta-title" className="pb-10">
      <div data-catch style={i(1)} className="relative mx-auto flex max-w-3xl flex-col items-center gap-5 rounded-lg border border-border-strong bg-bg-2/80 px-6 py-12 text-center backdrop-blur">
        <Mascot size={96} say="Bring your notes. I'll bring the lantern." bubbleSide="right" sleepAfterMs={0} />
        <h2 id="cta-title" className="text-[clamp(30px,5vw,48px)] text-text">
          The deep is waiting.
        </h2>
        <p className="max-w-md text-muted">Make your first game in a couple of minutes, or warm up with today&apos;s Daily Dive.</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <SignUpButton mode="modal" forceRedirectUrl="/home">
            <Button variant="primary" size="lg">
              Start playing — it&apos;s free
            </Button>
          </SignUpButton>
          <Button href="/explore" variant="secondary" size="lg">
            Browse courses
          </Button>
        </div>
      </div>
    </Surface>
  );
}
