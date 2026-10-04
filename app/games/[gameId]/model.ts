// The Game page's client-safe shapes and pure helpers: each Mode's words on this page, the
// Mode stats folded from finished Runs, and Lumen's line. Spec: docs/architecture/ui-map.md
// § Game page, docs/design/modes/<mode>.md (words).
import { formatDepth } from "@/components/modes/dive/tiers";
import type { GameStatus } from "@/lib/games/types";
import type { ModeId } from "@/lib/modes";
import type { Tier } from "@/lib/scoring/tiers";

export type MasteryView = { found: number; total: number; pct: number };

/** Leap, Pairs and Blitz stats that come from `runs.mode_state` (Dive and Apogee need none). */
export type ModeRunStats = {
  /** Leap: longest run of correct answers in any Run. */
  bestStreak: number;
  /** Leap: Hearts left on the best-scoring Run (null with no Runs). */
  heartsLeftOnBest: number | null;
  /** Leap: Runs that reached the summit (all 10 without falling). */
  summits: number;
  /** Pairs: fastest time to clear both Boards, in ms (null if never cleared). */
  bestClearMs: number | null;
  /** Pairs: Runs that cleared both Boards. */
  clears: number;
  /** Blitz: longest Combo. */
  bestCombo: number;
  /** Blitz: most statements answered right in one Run. */
  bestCorrect: number;
};

export type PageRun = {
  runId: string;
  /** 1 = the Player's first finished Run on this Game. */
  number: number;
  score: number;
  finishedAt: string;
  /** The Mode's ending (Leap `fell`/`cleared`, Pairs `cleared`/`time_up`, Blitz `time_up`/`deck_cleared`), else null. */
  outcome: string | null;
};

export type PageDay = { day: string; guesses: number; correct: number; accuracy: number };

export type PageTopic = {
  courseSlug: string;
  courseTitle: string;
  number: number;
  slug: string;
  title: string;
  locked: boolean;
  passed: boolean;
  passBar: string;
  prev: { number: number; slug: string; title: string } | null;
};

export type GamePageData = {
  game: {
    id: string;
    title: string;
    mode: ModeId;
    status: GameStatus;
    error: string | null;
    promptCount: number | null;
    createdAt: string;
    isPublic: boolean;
    /** Private Games only. */
    module: { id: string; name: string } | null;
    /** Private Games only (public Games never show their source files). */
    sources: { id: string; filename: string }[];
  };
  /** Set when the Game is a Course Topic's practice Game. */
  topic: PageTopic | null;
  personalBest: number;
  mastery: MasteryView;
  byTier: Record<Tier, { found: number; total: number }>;
  modeStats: ModeRunStats;
  /** Finished Runs, newest first (at most 60). */
  runs: PageRun[];
  runCount: number;
  /** Accuracy per Vancouver day, oldest first (last 30 days with guesses). */
  daily: PageDay[];
};

// ---------------------------------------------------------------------------------------
// Words per Mode

export type ModeWords = {
  /** The Play button. */
  play: string;
  /** What a Run is called in copy ("dive", "launch" …). */
  run: string;
  runs: string;
  /** The score in the Mode's metaphor. */
  score: (points: number) => string;
  /** The words for a Run's outcome, if the Mode has them. */
  outcome?: Record<string, string>;
};

const pts = (n: number) => `${Math.max(0, Math.round(n)).toLocaleString("en-US")} pts`;

export const MODE_WORDS: Record<ModeId, ModeWords> = {
  dive: { play: "▼ BEGIN DESCENT ▼", run: "dive", runs: "dives", score: formatDepth },
  apogee: {
    play: "LAUNCH",
    run: "launch",
    runs: "launches",
    score: (n) => `${Math.max(0, Math.round(n)).toLocaleString("en-US")} km`,
  },
  leap: { play: "JUMP IN", run: "climb", runs: "climbs", score: pts, outcome: { cleared: "SUMMIT", fell: "FELL" } },
  pairs: { play: "START MATCHING", run: "round", runs: "rounds", score: pts, outcome: { cleared: "ALL PAIRS", time_up: "TIME" } },
  blitz: { play: "GO", run: "blitz", runs: "blitzes", score: pts, outcome: { time_up: "TIME", deck_cleared: "DECK CLEARED" } },
  arena: { play: "ENTER", run: "match", runs: "matches", score: pts },
};

export function wordsFor(mode: ModeId): ModeWords {
  return MODE_WORDS[mode] ?? MODE_WORDS.dive;
}

// ---------------------------------------------------------------------------------------
// Mode stats from finished Runs

type BoardState = { startedAt: string | null; endedAt: string | null; cleared: boolean };

/** One finished Run as the loader reads it: score plus its Mode's jsonb state (null for Dive). */
export type RunWithState = { score: number; outcome: string | null; state: Record<string, unknown> | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Folds finished Runs (any order) into the Leap/Pairs/Blitz stats. Unknown shapes count as 0. */
export function modeRunStats(runs: RunWithState[]): ModeRunStats {
  const out: ModeRunStats = {
    bestStreak: 0,
    heartsLeftOnBest: null,
    summits: 0,
    bestClearMs: null,
    clears: 0,
    bestCombo: 0,
    bestCorrect: 0,
  };
  let best = -1;
  for (const r of runs) {
    const s = r.state ?? {};
    out.bestStreak = Math.max(out.bestStreak, num(s.bestStreak));
    out.bestCombo = Math.max(out.bestCombo, num(s.bestCombo));
    out.bestCorrect = Math.max(out.bestCorrect, num(s.correct));
    if ("hearts" in s && r.score > best) {
      best = r.score;
      out.heartsLeftOnBest = Math.max(0, num(s.hearts));
    }
    if (r.outcome === "cleared" && "hearts" in s) out.summits += 1;
    if (r.outcome === "cleared" && Array.isArray(s.boards)) {
      out.clears += 1;
      const ms = (s.boards as BoardState[]).reduce((sum, b) => {
        if (!b?.startedAt || !b?.endedAt) return NaN;
        return sum + (Date.parse(b.endedAt) - Date.parse(b.startedAt));
      }, 0);
      if (Number.isFinite(ms) && ms > 0) out.bestClearMs = out.bestClearMs === null ? ms : Math.min(out.bestClearMs, ms);
    }
  }
  return out;
}

/** Equal-width score buckets from 0 to the top score, for the spread view. Pure. */
export function scoreBuckets(scores: number[], count = 10): { from: number; to: number; n: number }[] {
  const top = Math.max(1, ...scores);
  const size = Math.max(1, Math.ceil(top / count));
  const buckets = Array.from({ length: count }, (_, i) => ({ from: i * size, to: (i + 1) * size, n: 0 }));
  for (const s of scores) buckets[Math.min(count - 1, Math.floor(Math.max(0, s) / size))].n += 1;
  return buckets;
}

// ---------------------------------------------------------------------------------------
// Lumen (the mascot) comments on your progress

export function lumenLine(input: {
  mode: ModeId;
  runCount: number;
  masteryPct: number;
  lastWasBest: boolean;
  locked?: boolean;
}): string {
  const { mode, runCount, masteryPct, lastWasBest, locked } = input;
  const w = wordsFor(mode);
  if (locked) return "This one's still locked. Pass the Topic before it and I'll open the hatch.";
  if (runCount === 0) {
    const first: Partial<Record<ModeId, string>> = {
      dive: "Calm water up here. Ready to see how deep you go?",
      apogee: "Fuel's loaded and the pad is clear. Count us down?",
      leap: "Those islands won't climb themselves. Jump in!",
      pairs: "Cards are shuffled. Let's see how fast you match.",
      blitz: "Sixty seconds, true or false. Blink and it's over!",
    };
    return first[mode] ?? `Your first ${w.run} is waiting.`;
  }
  if (lastWasBest && runCount > 1) return `Your last ${w.run} was your best yet. Can you top it?`;
  if (masteryPct >= 100) return "You've found every answer here. Show-off. Go for a new best?";
  if (masteryPct >= 75) return `${masteryPct}% mastered. Only the rare ones are left hiding.`;
  if (masteryPct >= 40) {
    return mode === "dive" || mode === "apogee"
      ? `${masteryPct}% found. Rarer answers still lurk ${mode === "dive" ? "below" : "up there"}.`
      : `${masteryPct}% learned. Keep at it and the rest will stick.`;
  }
  return `${runCount} ${runCount === 1 ? w.run : w.runs} in. Plenty of answers still to find.`;
}
