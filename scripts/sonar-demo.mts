#!/usr/bin/env node
// Sonar demo seed (F32, #73): gives a Player a deterministic Python Basics history that tells
// the demo story (docs/architecture/sonar.md § Demo setup):
//   Topics 1–2 strong. Topic 3 (Operators & Expressions) passed by the Course, but with misses
//   on comparisons and boundaries (<, <=, >=, ==). Topic 4 passed. Topic 5 (Loops) not passed,
//   with misses on while termination and range() stop boundaries, so Sonar's root cause is
//   comparison operators.
//
// Usage: npm run sonar:demo                    the allowlisted demo account (DEMO_PLAYERS)
//        npm run sonar:demo -- <playerId>     an allowlisted id, or a test id demo_sonar_*
//
// Resets first (one transaction): the Player's Runs, run_prompts, guess_events and
// topic_progress on the Python Basics Games only. Then writes finished Runs exactly as the
// engines would (lib/runs/engines/*) and topic_progress exactly as recordTopicRun would
// (lib/courses/progress.ts). No XP, no Badges. Re-running it is safe and gives the same story.
// Prompts are picked by their text (keywords), not by Concept tags, with a fixed RNG seed.

import path from "node:path";
import postgres from "postgres";
import { normalize } from "../lib/matching/normalize.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {}
}

// Fake history is only ever written for these accounts (the demo owner's own), plus synthetic
// test Players whose id starts with DEMO_TEST_PREFIX. Anything else is refused before the DB.
const DEMO_PLAYERS: Record<string, string> = { user_3KD852awCV88LswW9l5jkVyo4gB: "antonflorendo7@gmail.com" };
const DEMO_TEST_PREFIX = "demo_sonar_";
const DEFAULT_PLAYER = "user_3KD852awCV88LswW9l5jkVyo4gB";

const playerId: string = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? DEFAULT_PLAYER;
if (!Object.hasOwn(DEMO_PLAYERS, playerId) && !playerId.startsWith(DEMO_TEST_PREFIX)) {
  console.error(
    `Refusing to write demo data for ${playerId}: only ${Object.keys(DEMO_PLAYERS).join(", ")} ` +
      `or test ids starting with "${DEMO_TEST_PREFIX}" are allowed (DEMO_PLAYERS in scripts/sonar-demo.mts).`,
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put it in .env.local (see .env.example).");
  process.exit(1);
}

// ---------------------------------------------------------------------------------------
// Rules, copied from lib/modes/*/rules.ts and lib/scoring (those import "@/…", which plain
// node can't resolve). Keep in step if a Mode's scoring changes.

type Tier = "common" | "solid" | "deep" | "rare";
type Mode = "dive" | "leap" | "blitz";
const TIER_POINTS: Record<Tier, number> = { common: 10, solid: 25, deep: 60, rare: 100 };
const LEAP_QUESTIONS = 10, LEAP_QUESTION_MS = 15_000, LEAP_HEARTS = 3, LEAP_PASS_CORRECT = 7;
const BLITZ_MS = 60_000, BLITZ_PENALTY_MS = 3_000, BLITZ_COMBO_AT = 5, BLITZ_PASS_SCORE = 150;
const DIVE_LENGTH = 7, DIVE_PROMPT_MS = 25_000, DIVE_PENALTY_MS = 3_000, DIVE_PASS_SCORE = 150;
const streakMultiplier = (s: number) => (s >= 5 ? 2 : s >= 3 ? 1.5 : 1);
const leapPoints = (msLeft: number, streak: number) =>
  Math.round((100 + Math.round((50 * Math.min(Math.max(msLeft, 0), LEAP_QUESTION_MS)) / LEAP_QUESTION_MS)) * streakMultiplier(streak));
const blitzPoints = (comboBefore: number) => (comboBefore >= BLITZ_COMBO_AT ? 20 : 10);

// ---------------------------------------------------------------------------------------
// The story

/** Comparisons and boundaries: the root cause. */
const COMPARISON = /<=|>=|==|!=|(^|[^-])<|(^|[^-])>(?!=)|comparison|equal/i;
/** Loops misses on range()'s boundaries (stop excluded, start, step): for loops miss because of range(). */
const LOOP_BOUNDARY = /total|Adding up|range\(|stop|inclusive|off-by-one|one time too many|up to/i;

type Plan = {
  topic: number;
  mode: Mode;
  /** Prompts matching this miss (up to maxMisses); everything else is answered right. */
  miss?: RegExp;
  maxMisses?: number;
  /** Blitz: statements answered before the clock ran out. */
  answered?: number;
  /** Hours before now the Run finished. */
  hoursAgo: number;
};

const PLANS: Plan[] = [
  { topic: 1, mode: "leap", hoursAgo: 47 },
  { topic: 1, mode: "dive", hoursAgo: 46.5 },
  { topic: 2, mode: "leap", hoursAgo: 46 },
  { topic: 2, mode: "blitz", answered: 26, hoursAgo: 45.5 },
  { topic: 3, mode: "dive", miss: COMPARISON, maxMisses: 3, hoursAgo: 30 },
  { topic: 3, mode: "blitz", miss: COMPARISON, maxMisses: 4, answered: 28, hoursAgo: 29.5 },
  { topic: 3, mode: "leap", miss: COMPARISON, maxMisses: 2, hoursAgo: 29 },
  { topic: 4, mode: "leap", hoursAgo: 26 },
  { topic: 5, mode: "leap", miss: LOOP_BOUNDARY, maxMisses: 3, hoursAgo: 5 },
  { topic: 5, mode: "blitz", miss: LOOP_BOUNDARY, maxMisses: 7, answered: 16, hoursAgo: 4.5 },
  { topic: 5, mode: "dive", miss: LOOP_BOUNDARY, maxMisses: 4, hoursAgo: 1 },
];

// ---------------------------------------------------------------------------------------
// Deterministic RNG (mulberry32)

let seed = 0x50a4_2026;
function rand() {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo: number, hi: number) => Math.round(lo + rand() * (hi - lo));
function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------------------
// Data

type Prompt = {
  id: string;
  kind: string;
  text: string;
  tier: Tier | null;
  is_true: boolean | null;
  options: string[] | null;
  items: string[] | null;
  answer_id: string;
  canonical: string;
  answer_tier: Tier;
};
type Game = { topic_id: string; position: number; title: string; mode: Mode; game_id: string; prompts: Prompt[] };

type Tx = postgres.TransactionSql;
type RunOut = { runId: string; plan: Plan; game: Game; score: number; passed: boolean; guesses: number; misses: number; summary: { mode: Mode; score: number } };

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

const matches = (p: Prompt, re?: RegExp) => !!re && re.test(`${p.text} ${p.canonical}`);

/** Puts up to `max` Prompts matching `re` in the first `n` of the draw, the rest random. */
function draw(prompts: Prompt[], n: number, re?: RegExp, max = 0): Prompt[] {
  const all = shuffle(prompts);
  const targets = all.filter((p) => matches(p, re)).slice(0, max);
  const rest = all.filter((p) => !targets.includes(p));
  const head = shuffle([...targets, ...rest.slice(0, Math.max(0, n - targets.length))]);
  return [...head, ...rest.slice(Math.max(0, n - targets.length))];
}

async function insertRun(tx: Tx, game: Game, startedAt: Date) {
  const [r] = await tx<{ id: string }[]>`
    insert into runs (player_id, game_id, status, current_position, score, started_at)
    values (${playerId}, ${game.game_id}, 'in_progress', 1, 0, ${startedAt}) returning id`;
  return r.id;
}

type Guess = {
  runId: string; game: Game; prompt: Prompt; position: number; startedAt: Date; at: Date; raw: string;
  normalized: string | null; method: "exact" | "none" | "choice"; answerId: string | null; correct: boolean;
  points: number; tier: Tier | null;
};
async function logGuess(tx: Tx, g: Guess) {
  await tx`
    insert into guess_events (created_at, player_id, game_id, run_id, prompt_id, position, raw_text, normalized,
                              matched_answer_id, match_method, distance, is_correct, points, ms_into_prompt, hint_used, tier)
    values (${g.at}, ${playerId}, ${g.game.game_id}, ${g.runId}, ${g.prompt.id}, ${g.position}, ${g.raw}, ${g.normalized},
            ${g.answerId}, ${g.method}, ${null}, ${g.correct}, ${g.points}, ${Math.max(0, g.at.getTime() - g.startedAt.getTime())},
            false, ${g.tier})`;
}

async function runPrompt(tx: Tx, runId: string, position: number, promptId: string, f: {
  startedAt?: Date | null; deadlineAt?: Date | null; endedAt?: Date | null; outcome?: string | null; answerId?: string | null; points?: number;
} = {}) {
  await tx`
    insert into run_prompts (run_id, position, prompt_id, started_at, deadline_at, ended_at, outcome, answer_id, hint_used, points)
    values (${runId}, ${position}, ${promptId}, ${f.startedAt ?? null}, ${f.deadlineAt ?? null}, ${f.endedAt ?? null},
            ${f.outcome ?? null}, ${f.answerId ?? null}, false, ${f.points ?? 0})`;
}

async function finishRun(tx: Tx, runId: string, position: number, score: number, at: Date, state: unknown) {
  await tx`
    update runs set status = 'finished', finished_at = ${at}, score = ${score}, current_position = ${position},
                    mode_state = ${state === null ? null : tx.json(state as postgres.JSONValue)}
     where id = ${runId} and player_id = ${playerId}`;
}

// --- Leap: 10 multiple-choice, 3 Hearts --------------------------------------------------

async function playLeap(tx: Tx, game: Game, plan: Plan, start: Date): Promise<RunOut> {
  const deck = draw(game.prompts.filter((p) => p.kind === "multiple_choice"), LEAP_QUESTIONS, plan.miss, plan.maxMisses).slice(0, LEAP_QUESTIONS);
  const runId = await insertRun(tx, game, start);
  const s = { hearts: LEAP_HEARTS, streak: 0, bestStreak: 0, correct: 0, wrong: 0, timeouts: 0, lifelinePosition: null, outcome: null as string | null };
  let t = start.getTime() + 1500, score = 0, guesses = 0, misses = 0, position = 1;
  for (let i = 0; i < deck.length; i++) {
    const p = deck[i];
    position = i + 1;
    if (s.outcome) {
      await runPrompt(tx, runId, position, p.id);
      continue;
    }
    const started = new Date(t);
    const ms = between(2500, 9000);
    const at = new Date(t + ms);
    const wrong = misses < (plan.maxMisses ?? 0) && matches(p, plan.miss);
    let points = 0;
    if (wrong) {
      const choice = shuffle((p.options ?? []).filter((o) => o !== p.canonical))[0] ?? "?";
      s.hearts -= 1; s.streak = 0; s.wrong += 1; misses += 1;
      await logGuess(tx, { runId, game, prompt: p, position, startedAt: started, at, raw: JSON.stringify(choice), normalized: null, method: "choice", answerId: null, correct: false, points: 0, tier: null });
    } else {
      s.streak += 1; s.correct += 1; s.bestStreak = Math.max(s.bestStreak, s.streak);
      points = leapPoints(LEAP_QUESTION_MS - ms, s.streak);
      await logGuess(tx, { runId, game, prompt: p, position, startedAt: started, at, raw: JSON.stringify(p.canonical), normalized: null, method: "choice", answerId: p.answer_id, correct: true, points, tier: p.tier });
    }
    guesses += 1;
    score += points;
    await runPrompt(tx, runId, position, p.id, {
      startedAt: started, deadlineAt: new Date(t + LEAP_QUESTION_MS), endedAt: at, outcome: wrong ? "wrong" : "correct",
      answerId: wrong ? null : p.answer_id, points,
    });
    if (s.hearts <= 0) s.outcome = "fell";
    else if (position >= LEAP_QUESTIONS) s.outcome = "cleared";
    t = at.getTime() + between(1200, 2500);
  }
  // current_position stays on the last question played (the 10th, or the one that cost the last Heart)
  await finishRun(tx, runId, guesses, score, new Date(t), s);
  const passed = s.outcome !== "fell" && s.correct >= LEAP_PASS_CORRECT;
  return { runId, plan, game, score, passed, guesses, misses, summary: { mode: "leap", score } };
}

// --- Blitz: true/false against a 60 s clock -----------------------------------------------

async function playBlitz(tx: Tx, game: Game, plan: Plan, start: Date): Promise<RunOut> {
  const statements = game.prompts.filter((p) => p.kind === "true_false");
  const answered = Math.min(plan.answered ?? 20, statements.length - 1);
  const deck = draw(statements, answered, plan.miss, plan.maxMisses);
  const runId = await insertRun(tx, game, start);
  const clockStart = new Date(start.getTime() + 1000);
  const s = {
    startedAt: clockStart.toISOString(), deadlineAt: new Date(clockStart.getTime() + BLITZ_MS).toISOString(), deckSize: deck.length,
    combo: 0, bestCombo: 0, correct: 0, wrong: 0, outcome: "time_up",
  };
  // Pace the answers so the last one lands just before the (penalised) deadline
  const missing = deck.slice(0, answered).filter((p) => matches(p, plan.miss)).slice(0, plan.maxMisses ?? 0);
  const budget = BLITZ_MS - missing.length * BLITZ_PENALTY_MS - 1500;
  const step = Math.floor(budget / answered);
  let t = clockStart.getTime(), score = 0, misses = 0;
  for (let i = 0; i < deck.length; i++) {
    const p = deck[i];
    const position = i + 1;
    if (i > answered) {
      await runPrompt(tx, runId, position, p.id);
      continue;
    }
    const dealt = new Date(t);
    if (i === answered) {
      // Dealt when the clock ran out: closed as a timeout, no guess
      await runPrompt(tx, runId, position, p.id, { startedAt: dealt, endedAt: new Date(Date.parse(s.deadlineAt)), outcome: "timeout" });
      continue;
    }
    const at = new Date(t + Math.max(600, step + between(-250, 250)));
    const wrong = missing.includes(p);
    let points = 0;
    if (wrong) {
      s.combo = 0; s.wrong += 1; misses += 1;
      s.deadlineAt = new Date(Date.parse(s.deadlineAt) - BLITZ_PENALTY_MS).toISOString();
    } else {
      points = blitzPoints(s.combo);
      s.combo += 1; s.correct += 1; s.bestCombo = Math.max(s.bestCombo, s.combo);
    }
    score += points;
    await logGuess(tx, {
      runId, game, prompt: p, position, startedAt: dealt, at, raw: JSON.stringify(wrong ? !p.is_true : p.is_true), normalized: null,
      method: "choice", answerId: wrong ? null : p.answer_id, correct: !wrong, points, tier: wrong ? null : p.tier,
    });
    await runPrompt(tx, runId, position, p.id, { startedAt: dealt, endedAt: at, outcome: wrong ? "wrong" : "correct", answerId: wrong ? null : p.answer_id, points });
    t = at.getTime();
  }
  const end = new Date(Date.parse(s.deadlineAt) + 200);
  await finishRun(tx, runId, answered + 1, score, end, s);
  return { runId, plan, game, score, passed: score >= BLITZ_PASS_SCORE, guesses: answered, misses, summary: { mode: "blitz", score } };
}

// --- Dive: 7 Prompts, typed or one-shot ------------------------------------------------------

const TYPED = ["open", "cloze", "definition_to_term"];

/** A believable wrong typed answer: off by one for numbers. */
function wrongTyped(p: Prompt): string {
  const n = Number(p.canonical);
  if (p.canonical.trim() !== "" && Number.isFinite(n)) return String(n - 1);
  if (/while|loop/i.test(p.text)) return "while";
  return p.kind === "open" ? "=>" : "equals";
}

async function playDive(tx: Tx, game: Game, plan: Plan, start: Date): Promise<RunOut> {
  const deck = draw(game.prompts, DIVE_LENGTH, plan.miss, plan.maxMisses).slice(0, DIVE_LENGTH);
  const runId = await insertRun(tx, game, start);
  let t = start.getTime() + 1500, score = 0, guesses = 0, misses = 0;
  for (let i = 0; i < deck.length; i++) {
    const p = deck[i];
    const position = i + 1;
    const started = new Date(t);
    const deadline = new Date(t + DIVE_PROMPT_MS);
    const wrong = misses < (plan.maxMisses ?? 0) && matches(p, plan.miss);
    const base = { runId, game, prompt: p, position, startedAt: started };
    if (TYPED.includes(p.kind)) {
      if (wrong) {
        // One wrong guess (3 s penalty), then the clock runs out
        const raw = wrongTyped(p);
        const at = new Date(t + between(5000, 9000));
        await logGuess(tx, { ...base, at, raw, normalized: normalize(raw), method: "none", answerId: null, correct: false, points: 0, tier: null });
        const end = new Date(deadline.getTime() - DIVE_PENALTY_MS);
        await runPrompt(tx, runId, position, p.id, { startedAt: started, deadlineAt: end, endedAt: new Date(end.getTime() + 300), outcome: "timeout" });
        t = end.getTime() + between(1500, 3000);
        misses += 1;
      } else {
        const at = new Date(t + between(3000, 10000));
        const points = TIER_POINTS[p.kind === "open" ? p.answer_tier : (p.tier ?? p.answer_tier)];
        await logGuess(tx, { ...base, at, raw: p.canonical, normalized: normalize(p.canonical), method: "exact", answerId: p.answer_id, correct: true, points, tier: p.answer_tier });
        await runPrompt(tx, runId, position, p.id, { startedAt: started, deadlineAt: deadline, endedAt: at, outcome: "correct", answerId: p.answer_id, points });
        score += points;
        t = at.getTime() + between(1500, 3000);
      }
    } else {
      const at = new Date(t + between(4000, 12000));
      let raw: string;
      if (p.kind === "ordered_recall") raw = JSON.stringify(wrong ? [...(p.items ?? [])].reverse() : p.items);
      else raw = JSON.stringify(wrong ? (p.options ?? []).find((o) => o !== p.canonical) : p.canonical);
      const points = wrong ? 0 : TIER_POINTS[p.tier ?? "common"];
      await logGuess(tx, { ...base, at, raw, normalized: null, method: "choice", answerId: wrong ? null : p.answer_id, correct: !wrong, points, tier: wrong ? null : p.tier });
      await runPrompt(tx, runId, position, p.id, { startedAt: started, deadlineAt: deadline, endedAt: at, outcome: wrong ? "wrong" : "correct", answerId: wrong ? null : p.answer_id, points });
      score += points;
      if (wrong) misses += 1;
      t = at.getTime() + between(1500, 3000);
    }
    guesses += 1;
  }
  await finishRun(tx, runId, DIVE_LENGTH, score, new Date(t), null);
  return { runId, plan, game, score, passed: score >= DIVE_PASS_SCORE, guesses, misses, summary: { mode: "dive", score } };
}

// ---------------------------------------------------------------------------------------
// topic_progress, as recordTopicRun writes it (no XP, no Badges)

type ModeRecord = { best: number; passed: boolean; runs: number };
async function recordTopicRun(tx: Tx, out: RunOut, finishedAt: Date) {
  const topicId = out.game.topic_id;
  await tx`insert into topic_progress (player_id, topic_id) values (${playerId}, ${topicId}) on conflict (player_id, topic_id) do nothing`;
  const [row] = await tx<{ modes: Record<string, ModeRecord>; passed_at: Date | null }[]>`
    select modes, passed_at from topic_progress where player_id = ${playerId} and topic_id = ${topicId} for update`;
  const old = row.modes[out.plan.mode];
  const modes = {
    ...row.modes,
    [out.plan.mode]: { best: Math.max(old?.best ?? out.score, out.score), passed: (old?.passed ?? false) || out.passed, runs: (old?.runs ?? 0) + 1 },
  };
  const passedNow = out.passed && row.passed_at === null;
  await tx`
    update topic_progress
       set modes = ${tx.json(modes as postgres.JSONValue)}, updated_at = ${finishedAt},
           passed_at = coalesce(passed_at, ${passedNow ? finishedAt : null}),
           passed_run_id = case when passed_at is null then ${passedNow ? out.runId : null}::uuid else passed_run_id end,
           passed_mode = case when passed_at is null then ${passedNow ? out.plan.mode : null} else passed_mode end
     where player_id = ${playerId} and topic_id = ${topicId}`;
}

// ---------------------------------------------------------------------------------------

try {
  const outs = await sql.begin(async (tx) => {
    const [course] = await tx<{ id: string; module_id: string }[]>`select id, module_id from courses where slug = 'python-basics'`;
    if (!course) throw new Error("Python Basics isn't seeded: run npm run db:seed:courses first");

    // The Player (and a username, so profile pages work for a throwaway id)
    await tx`insert into players (id) values (${playerId}) on conflict (id) do nothing`;
    await tx`
      update players set username = ${playerId.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20)},
                         display_name = coalesce(display_name, 'Sonar Demo')
       where id = ${playerId} and username is null
         and not exists (select 1 from players where username = ${playerId.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 20)})`;

    // Reset: this Player's history on the Course's Games only
    const games = tx`select id from games where module_id = ${course.module_id}`;
    await tx`delete from topic_progress where player_id = ${playerId}
              and topic_id in (select id from course_topics where course_id = ${course.id})`;
    await tx`delete from guess_events where player_id = ${playerId} and game_id in (${games})`;
    await tx`delete from runs where player_id = ${playerId} and game_id in (${games})`;

    const rows = await tx<(Prompt & { topic_id: string; position: number; title: string; mode: Mode; game_id: string })[]>`
      select t.id as topic_id, t.position, t.title, tg.mode, tg.game_id,
             p.id, p.kind, p.text, p.tier, p.is_true, p.options, p.items,
             a.id as answer_id, a.canonical, a.tier as answer_tier
        from course_topics t
        join topic_games tg on tg.topic_id = t.id
        join prompts p on p.game_id = tg.game_id
        join lateral (select id, canonical, tier from answers where prompt_id = p.id order by rarity_rank nulls first, id limit 1) a on true
       where t.course_id = ${course.id} and tg.mode in ('dive', 'leap', 'blitz')
       order by t.position, tg.mode, p.id`;
    const byGame = new Map<string, Game>();
    for (const r of rows) {
      const key = `${r.position}:${r.mode}`;
      if (!byGame.has(key)) byGame.set(key, { topic_id: r.topic_id, position: r.position, title: r.title, mode: r.mode, game_id: r.game_id, prompts: [] });
      byGame.get(key)!.prompts.push(r);
    }

    const now = Date.now();
    const outs: RunOut[] = [];
    for (const plan of PLANS) {
      const game = byGame.get(`${plan.topic}:${plan.mode}`);
      if (!game) throw new Error(`No ${plan.mode} Game for Topic ${plan.topic}`);
      const start = new Date(now - plan.hoursAgo * 3600_000);
      const out = await (plan.mode === "leap" ? playLeap : plan.mode === "blitz" ? playBlitz : playDive)(tx, game, plan, start);
      const [{ finished_at }] = await tx<{ finished_at: Date }[]>`select finished_at from runs where id = ${out.runId}`;
      await recordTopicRun(tx, out, finished_at);
      outs.push(out);
    }
    return outs;
  });

  console.log(`Sonar demo history for ${playerId}: ${outs.length} Runs, ${outs.reduce((n, o) => n + o.guesses, 0)} guesses`);
  for (const o of outs) {
    console.log(
      `  T${o.plan.topic} ${o.game.title.padEnd(24)} ${o.plan.mode.padEnd(5)} score ${String(o.score).padStart(4)}  ` +
        `${o.passed ? "pass" : "    "}  ${o.guesses} guesses, ${o.misses} misses  /runs/${o.runId}/reveal`,
    );
  }
  const topics = [...new Set(outs.map((o) => o.plan.topic))];
  console.log("Misses per Topic:");
  for (const t of topics) {
    const mine = outs.filter((o) => o.plan.topic === t);
    console.log(`  Topic ${t}: ${mine.reduce((n, o) => n + o.misses, 0)} misses / ${mine.reduce((n, o) => n + o.guesses, 0)} guesses, ${mine.some((o) => o.passed) ? "passed" : "not passed"}`);
  }
} catch (err) {
  console.error("\nSonar demo seed failed:", (err as Error).message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
