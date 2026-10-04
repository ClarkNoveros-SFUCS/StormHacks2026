// Integration tests for the Daily Dive against Tiger Data. Run with `npm run test:db`.
// Each test writes test puzzles through the real writer (lib/daily/puzzle.ts) on far-future
// days inside a rolled-back transaction, then plays them as ordinary Players with a fake
// clock. The race tests use two real connections whose transactions are also rolled back.
import { randomInt, randomUUID } from "node:crypto";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import pool from "@/db/seed/daily/pool.json";
import { sql } from "@/lib/db";
import { PROMPT_MS } from "@/lib/modes/dive/rules";
import * as engine from "@/lib/runs/run-engine";
import type { DiveReveal, DiveRunState, GuessBody } from "@/lib/runs/types";
import { addDays, startOfVancouverDay } from "./days";
import { buildPuzzleRows, checkPuzzle, writePuzzle, type PuzzleFile } from "./puzzle";
import { dailyArchive, dailyLeaderboard, dailyToday, getDailyPuzzle, startTodayRun } from "./queries";

type Tx = postgres.TransactionSql;
class Rollback extends Error {
  constructor(public value?: unknown) {
    super("rollback");
  }
}

const puzzles = pool.puzzles as unknown as PuzzleFile[];

/** A random far-future day, so tests never meet real puzzles (or each other). */
function farDay(): string {
  return addDays("2199-01-01", randomInt(0, 36_000));
}

class Clock {
  t: number;
  constructor(day: string, hour = 12) {
    this.t = startOfVancouverDay(day).getTime() + hour * 3_600_000;
  }
  now() { return new Date(this.t); }
  tick(ms: number) { this.t += ms; return this.now(); }
}

type F = { tx: Tx; players: string[]; day: string; clock: Clock; number: number; gameId: string };

/** Writes a test puzzle (Daily #1's content) scheduled for a far-future day, then runs `fn`. */
async function withPuzzle(fn: (f: F) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const players = Array.from({ length: 4 }, () => `test_f23_${randomUUID()}`);
      await tx`insert into players ${tx(players.map((id) => ({ id })))}`;
      const day = farDay();
      const number = 1_000_000 + randomInt(0, 1_000_000_000);
      const checked = checkPuzzle(puzzles[0], { strict: true });
      expect(checked.errors).toEqual([]);
      const written = await writePuzzle(tx, buildPuzzleRows(checked, number), { day, source: "seed" });
      expect(written).toMatchObject({ outcome: "created", status: "scheduled", day });
      const [{ game_id }] = await tx<{ game_id: string }[]>`select game_id from daily_puzzles where number = ${number}`;
      await fn({ tx, players, day, clock: new Clock(day), number, gameId: game_id });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

/** The right submission for the Run's current Prompt (an Open Prompt: its most obvious Answer). */
async function rightAnswer(tx: Tx, runId: string, position: number): Promise<GuessBody> {
  const [p] = await tx<{ kind: string; items: string[] | null; canonical: string }[]>`
    select p.kind, p.items, a.canonical from run_prompts rp join prompts p on p.id = rp.prompt_id
      join answers a on a.prompt_id = p.id
     where rp.run_id = ${runId} and rp.position = ${position}
     order by a.rarity_rank nulls first limit 1`;
  if (p.kind === "ordered_recall") return { order: p.items!, position };
  if (p.kind === "odd_one_out") return { option: p.canonical, position };
  return { text: p.canonical, position };
}

/** Plays a Daily Run to the end: right answers, except the positions in `miss` time out. */
async function play(f: F, playerId: string, runId: string, miss: number[] = []) {
  let s = (await engine.getRunState(f.tx, playerId, runId, f.clock.now())) as DiveRunState;
  while (s.status === "in_progress") {
    s = (await engine.startPrompt(f.tx, playerId, runId, f.clock.tick(100))) as DiveRunState;
    if (miss.includes(s.position)) {
      s = (await engine.timeoutPrompt(f.tx, playerId, runId, f.clock.tick(PROMPT_MS))) as DiveRunState;
    } else {
      s = (await engine.guess(f.tx, playerId, runId, await rightAnswer(f.tx, runId, s.position), f.clock.tick(1_000))).state;
    }
  }
  const [{ score }] = await f.tx<{ score: number }[]>`select score from runs where id = ${runId}`;
  return score;
}

async function playToday(f: F, playerId: string, miss: number[] = []) {
  const start = await startTodayRun(f.tx, playerId, f.clock.now());
  const score = await play(f, playerId, start.runId, miss);
  return { ...start, score };
}

describe("Daily Dive", () => {
  it("goes live on its day via the lazy path: the Game turns public, and only today is claimed", () =>
    withPuzzle(async (f) => {
      const [before] = await f.tx<{ visibility: string }[]>`select visibility from games where id = ${f.gameId}`;
      expect(before.visibility).toBe("private");
      // Not today yet: a scheduled puzzle isn't served
      expect(await getDailyPuzzle(f.day, new Clock(addDays(f.day, -1)).now(), f.tx)).toBeNull();
      const p = await getDailyPuzzle(f.day, f.clock.now(), f.tx);
      expect(p).toMatchObject({ number: f.number, day: f.day, game_id: f.gameId });
      expect(p!.prompt_ids).toHaveLength(7);
      const [after] = await f.tx<{ status: string; visibility: string }[]>`
        select d.status, g.visibility from daily_puzzles d join games g on g.id = d.game_id where d.number = ${f.number}`;
      expect(after).toEqual({ status: "live", visibility: "public" });
    }));

  it("the job procedure claims the day's puzzle in the database, idempotently", () =>
    withPuzzle(async (f) => {
      await f.tx`call assign_daily_puzzle(0, ${f.tx.json({ day: f.day })})`;
      const [p] = await f.tx<{ number: number; status: string; live: boolean }[]>`
        select number, status, live_at is not null as live from daily_puzzles where day = ${f.day}`;
      expect(p).toEqual({ number: f.number, status: "live", live: true });

      // An unscheduled day takes the lowest-numbered pool puzzle
      const empty = addDays(f.day, 1);
      const [next] = await f.tx<{ number: number | null }[]>`select min(number) as number from daily_puzzles where status = 'pool'`;
      await f.tx`call assign_daily_puzzle(0, ${f.tx.json({ day: empty })})`;
      await f.tx`call assign_daily_puzzle(0, ${f.tx.json({ day: empty })})`;
      const claimed = await f.tx<{ number: number; status: string }[]>`select number, status from daily_puzzles where day = ${empty}`;
      if (next.number === null) expect(claimed).toEqual([]);
      else expect(claimed).toEqual([{ number: next.number, status: "live" }]);

      // The UNIQUE (day) backstop: a second puzzle can never share a day
      const err = await f.tx.savepoint((sp) => sp`update daily_puzzles set day = ${f.day}, status = 'scheduled' where status = 'pool' and number <> ${f.number}`)
        .then(() => null, (e: Error) => e);
      if (next.number !== null) expect(err?.message ?? "").toMatch(/duplicate key|unique/i);
    }));

  it("counts only the first finished Run of the day; later Runs are practice", () =>
    withPuzzle(async (f) => {
      const [a] = f.players;
      const first = await playToday(f, a, [7]);
      expect(first).toMatchObject({ counted: true, resumed: false, number: f.number, day: f.day });

      const [row] = await f.tx<{ run_id: string; score: number; tiers: (string | null)[] }[]>`
        select run_id, score, tiers from daily_results where player_id = ${a} and day = ${f.day}`;
      expect(row.run_id).toBe(first.runId);
      expect(row.score).toBe(first.score);
      expect(row.tiers).toHaveLength(7);
      expect(row.tiers[6]).toBeNull(); // the missed Prompt
      expect(row.tiers.slice(0, 3)).toEqual(["common", "common", "common"]); // most obvious Open Answers
      const xp = await f.tx`select 1 from xp_events where player_id = ${a} and reason = 'daily_played' and ref = ${f.day}`;
      expect(xp).toHaveLength(1);
      const finds = await f.tx`select answer_id from daily_answer_finds where player_id = ${a} and day = ${f.day}`;
      expect(finds).toHaveLength(6);

      // Practice: a second Run on the same day isn't counted
      const practice = await playToday(f, a);
      expect(practice.counted).toBe(false);
      const rows = await f.tx`select run_id from daily_results where player_id = ${a} and day = ${f.day}`;
      expect(rows).toEqual([{ run_id: first.runId }]);

      const today = await dailyToday(a, f.clock.now(), f.tx);
      expect(today!.me).toMatchObject({ status: "counted", runId: first.runId, result: { score: first.score, depth: first.score * 10 } });
      expect(today!.me!.result!.shareText).toMatch(new RegExp(`^SYLLABYSS Daily #${f.number} · `));
      expect(today!.me!.dailyStreak.current).toBe(1);

      // The Reveals say which is which
      const counted = (await engine.getReveal(f.tx, a, first.runId)) as DiveReveal;
      expect(counted.daily).toMatchObject({ number: f.number, day: f.day, counted: true });
      expect(counted.daily!.shareText).not.toMatch(/practice/);
      const replay = (await engine.getReveal(f.tx, a, practice.runId)) as DiveReveal;
      expect(replay.daily).toMatchObject({ counted: false });
      expect(replay.daily!.shareText).toMatch(/\(practice\)/);
    }));

  it("plays the Prompts in fact sheet order and resumes an in-progress Run", () =>
    withPuzzle(async (f) => {
      const [a] = f.players;
      const start = await startTodayRun(f.tx, a, f.clock.now());
      const again = await startTodayRun(f.tx, a, f.clock.tick(1_000));
      expect(again).toMatchObject({ runId: start.runId, resumed: true, counted: true });
      expect((await dailyToday(a, f.clock.now(), f.tx))!.me).toMatchObject({ status: "in_progress", runId: start.runId });
      const order = await f.tx<{ prompt_id: string }[]>`select prompt_id from run_prompts where run_id = ${start.runId} order by position`;
      const [p] = await f.tx<{ prompt_ids: string[] }[]>`select prompt_ids from daily_puzzles where number = ${f.number}`;
      expect(order.map((r) => r.prompt_id)).toEqual(p.prompt_ids);
      const today = await dailyToday(null, f.clock.now(), f.tx);
      expect(today).toMatchObject({ number: f.number, me: null, teaser: "Name a sorting algorithm", promptCount: 7 });
      expect(today!.nextAt).toBe(startOfVancouverDay(addDays(f.day, 1)).toISOString());
    }));

  it("doesn't count a Run on the puzzle that finishes after its day (archive practice)", () =>
    withPuzzle(async (f) => {
      const [a] = f.players;
      await getDailyPuzzle(f.day, f.clock.now(), f.tx);
      f.clock.tick(24 * 3_600_000); // the next day
      const { runId } = await engine.createRun(f.tx, a, f.gameId, f.clock.now());
      await play(f, a, runId);
      expect(await f.tx`select 1 from daily_results where player_id = ${a}`).toHaveLength(0);
      const reveal = (await engine.getReveal(f.tx, a, runId)) as DiveReveal;
      expect(reveal.daily).toMatchObject({ counted: false, day: f.day });
      const archive = await dailyArchive(a, {}, f.clock.now(), f.tx);
      const entry = archive.find((d) => d.number === f.number);
      expect(entry).toMatchObject({ day: f.day, isToday: false, me: { counted: null, runs: 1 } });
    }));

  it("ranks the day's board by the counted score, then finish time, and serves crowd stats", () =>
    withPuzzle(async (f) => {
      const [a, b, c, d] = f.players;
      const sa = await playToday(f, a); //          all right
      const sb = await playToday(f, b, [1, 2]); //  two misses
      const sc = await playToday(f, c, [1, 2]); //  same score as b, finished later
      await playToday(f, c); //                     practice (all right): mustn't count
      expect(sb.score).toBe(sc.score);
      expect(sa.score).toBeGreaterThan(sb.score);

      const board = await dailyLeaderboard(d, { day: f.day }, f.clock.now(), f.tx);
      expect(board!.daily).toMatchObject({ number: f.number, day: f.day, gameId: f.gameId });
      // A tie on score goes to whoever finished first (F21's order: score desc, finish time asc)
      expect(board!.leaderboard.entries.map((e) => [e.value, e.place])).toEqual([[sa.score, 1], [sb.score, 2], [sc.score, 3]]);
      expect(board!.leaderboard.me).toBeNull();
      const asB = await dailyLeaderboard(b, { day: f.day }, f.clock.now(), f.tx);
      expect(asB!.leaderboard.me).toMatchObject({ place: 2, value: sb.score, isMe: true });
      const asC = await dailyLeaderboard(c, { day: f.day }, f.clock.now(), f.tx);
      expect(asC!.leaderboard.me).toMatchObject({ place: 3, value: sc.score }); // the counted Run, not the practice one
      // Signed out, the global board still works
      expect((await dailyLeaderboard(null, { day: f.day }, f.clock.now(), f.tx))!.leaderboard.total).toBe(3);

      // Crowd stats in b's Reveal: 3 counted Runs, b beat nobody (c tied), a found everything
      const reveal = (await engine.getReveal(f.tx, b, sb.runId)) as DiveReveal;
      expect(reveal.crowd!.players).toBe(3);
      expect(reveal.crowd!.betterThanPct).toBe(0);
      expect(reveal.crowd!.histogram.reduce((n, h) => n + h.count, 0)).toBe(3);
      const bucketOf = (s: number) => Math.floor(s / 50) * 50;
      const inA = [sa, sb, sc].filter((r) => bucketOf(r.score) === bucketOf(sa.score)).length;
      expect(reveal.crowd!.histogram.find((h) => h.bucket === bucketOf(sa.score))!.count).toBe(inA);
      expect(reveal.crowd!.histogram.at(-1)!.bucket).toBe(bucketOf(sa.score)); // up to the top bucket in use
      expect(reveal.crowd!.medianScore).toBe(sb.score);
      const aReveal = (await engine.getReveal(f.tx, a, sa.runId)) as DiveReveal;
      expect(aReveal.crowd!.betterThanPct).toBe(67);
      const rates = aReveal.crowd!.answerFindRates;
      const first = rates.filter((r) => r.position === 1); // only a found an Answer to Prompt 1
      expect(first[0]).toMatchObject({ answer: "Bubble sort", pct: 33 });
      expect(first.slice(1).every((r) => r.pct === 0)).toBe(true);
      expect(rates.find((r) => r.position === 3)!.pct).toBe(100); // everyone's most obvious Answer

      // The day is over: claiming the next day hands out daily-top-10 for this one, once
      await f.tx`call assign_daily_puzzle(0, ${f.tx.json({ day: addDays(f.day, 1) })})`;
      const badges = await f.tx<{ player_id: string; ref: string }[]>`
        select player_id, ref from player_badges where badge_id = 'daily-top-10' and player_id = any(${f.players}::text[]) order by player_id`;
      expect(badges.map((x) => x.player_id).sort()).toEqual([a, b, c].sort());
      expect(badges.every((x) => x.ref === f.day)).toBe(true);
      const [{ awarded }] = await f.tx<{ awarded: number }[]>`select award_daily_top10(${addDays(f.day, 2)}::date) as awarded`;
      expect(awarded).toBe(0);
    }));
});

describe("Daily Dive claim races", () => {
  /** Runs `fn` in its own transaction and rolls it back; resolves with fn's value. */
  function rolledBack<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => { throw new Rollback(await fn(tx)); }).then(
      () => { throw new Error("unreachable"); },
      (e) => { if (e instanceof Rollback) return e.value as T; throw e; },
    );
  }

  it("serializes two claims for the same day: the second waits, then finds one puzzle", async () => {
    const day = farDay();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let claimedA!: (n: number | null) => void;
    const aClaimed = new Promise<number | null>((r) => (claimedA = r));
    const a = rolledBack(async (tx) => {
      const [{ n }] = await tx<{ n: number | null }[]>`select claim_daily_puzzle(${day}::date) as n`;
      claimedA(n);
      await held;
    });
    const nA = await aClaimed;
    let bDone = false;
    const b = rolledBack(async (tx) => {
      const [{ n }] = await tx<{ n: number | null }[]>`select claim_daily_puzzle(${day}::date) as n`;
      bDone = true;
      const [{ count }] = await tx<{ count: number }[]>`select count(*)::int as count from daily_puzzles where day = ${day}`;
      return { n, count };
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(bDone).toBe(false); // blocked on A's per-day lock
    release();
    await a;
    const result = await b;
    expect(result.n).toBe(nA); // A rolled back, so B claims the same lowest pool puzzle
    expect(result.count).toBe(nA === null ? 0 : 1);
  });

  it("never gives two days the same pool puzzle", async () => {
    const [d1, d2] = [farDay(), farDay()];
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    let claimedA!: (n: number | null) => void;
    const aClaimed = new Promise<number | null>((r) => (claimedA = r));
    const a = rolledBack(async (tx) => {
      const [{ n }] = await tx<{ n: number | null }[]>`select claim_daily_puzzle(${d1}::date) as n`;
      claimedA(n);
      await held;
    });
    const nA = await aClaimed;
    const b = rolledBack(async (tx) => (await tx<{ n: number | null }[]>`select claim_daily_puzzle(${d2}::date) as n`)[0].n);
    await new Promise((r) => setTimeout(r, 300));
    release();
    await a;
    const nB = await b;
    if (nA !== null && nB !== null) expect(nB).not.toBe(nA);
  });
});
