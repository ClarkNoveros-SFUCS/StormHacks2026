// Integration tests for the Apogee, Leap, Pairs and Blitz run engines against Tiger Data.
// Run with `npm run test:db`. Each test builds a Game of one Mode from the seed fixtures with the
// real generation pipeline (fake Gemini), inside a rolled-back transaction, and drives the
// engine with a fake clock. Dive itself is covered by run-engine.db.test.ts.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import modesFixture from "@/db/seed/graph-algorithms-modes.json";
import { sql } from "@/lib/db";
import { generateGame } from "@/lib/games/generate-game";
import type { ModeId } from "@/lib/modes";
import { BLITZ_MS, BLITZ_PENALTY_MS } from "@/lib/modes/blitz/rules";
import { LEAP_QUESTION_MS, leapPoints } from "@/lib/modes/leap/rules";
import { PAIRS_BOARD_MS, PAIRS_MISMATCH_PENALTY_MS, timeBonus } from "@/lib/modes/pairs/rules";
import * as engine from "./run-engine";
import { RunError } from "./run-engine";
import type {
  BlitzAnswerResponse, BlitzReveal, BlitzRunState, DiveReveal, DiveRunState, LeapAnswerResponse, LeapOptionId,
  LeapReveal, LeapRunState, PairResponse, PairsReveal, PairsRunState, RunState,
} from "./types";

type Tx = postgres.TransactionSql;

class Clock {
  t = Date.parse("2026-10-04T12:00:00Z");
  now() { return new Date(this.t); }
  tick(ms: number) { this.t += ms; return this.now(); }
}

class Rollback extends Error {}

type F = { tx: Tx; playerId: string; otherPlayerId: string; gameId: string; clock: Clock };

const promptsFor = (mode: ModeId) =>
  mode === "apogee" ? fixture.game.prompts : modesFixture.games.find((g) => g.mode === mode)!.prompts!;

/** A ready Game of `mode`, generated from the seed fixture by the real pipeline. */
async function withGame(mode: ModeId, fn: (f: F) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f20_${randomUUID()}`;
      const otherPlayerId = `test_f20_${randomUUID()}`;
      await tx`INSERT INTO players (id) VALUES (${playerId}), (${otherPlayerId})`;
      const [mod] = await tx`INSERT INTO modules (player_id, name) VALUES (${playerId}, 'F20 test') RETURNING id`;
      const [doc] = await tx`
        INSERT INTO source_documents (module_id, player_id, filename, mime_type, size_bytes, status, page_count)
        VALUES (${mod.id}, ${playerId}, 'week9.pptx', 'application/pdf', 1, 'parsed', ${fixture.document.pages.length}) RETURNING id`;
      await tx`INSERT INTO source_pages ${tx(fixture.document.pages.map((p) => ({
        source_document_id: doc.id, page_index: p.page_number - 1, page_number: p.page_number, content_md: p.content_md,
      })))}`;
      const [game] = await tx`
        INSERT INTO games (module_id, player_id, title, mode, status) VALUES (${mod.id}, ${playerId}, 'F20 test', ${mode}, 'queued')
        RETURNING id`;
      await tx`INSERT INTO game_sources (game_id, source_document_id) VALUES (${game.id}, ${doc.id})`;
      const result = await generateGame(game.id, { db: tx, generate: async () => ({ response: { prompts: promptsFor(mode) } }) });
      expect(result.status).toBe("ready");
      await fn({ tx, playerId, otherPlayerId, gameId: game.id, clock: new Clock() });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

async function rejects(p: Promise<unknown>, status: number, message?: RegExp) {
  await expect(p).rejects.toSatisfy((e) => e instanceof RunError && e.status === status && (!message || message.test(e.message)));
}

// Typed views of the Mode-generic commands
const state = <S extends RunState>(f: F, runId: string) => engine.getRunState(f.tx, f.playerId, runId, f.clock.now()) as Promise<S>;
const start = <S extends RunState>(f: F, runId: string) => engine.startPrompt(f.tx, f.playerId, runId, f.clock.now()) as Promise<S>;
const timeout = <S extends RunState>(f: F, runId: string) => engine.timeoutPrompt(f.tx, f.playerId, runId, f.clock.now()) as Promise<S>;
const reveal = <R>(f: F, runId: string) => engine.getReveal(f.tx, f.playerId, runId) as Promise<R>;

describe.skipIf(!process.env.DATABASE_URL)("Mode run engines", () => {
  afterAll(() => sql.end());

  // ---------------------------------------------------------------------------------------
  describe("Apogee", () => {
    it("plays by Dive's rules under its own mode, and only takes /guess and /hint", () =>
      withGame("apogee", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        const s = await start<DiveRunState>(f, runId);
        expect(s).toMatchObject({ mode: "apogee", gameId: f.gameId, position: 1, promptCount: 7, prompt: { startedAt: f.clock.now().toISOString() } });
        expect(Date.parse(s.prompt!.deadlineAt!) - f.clock.t).toBe(25_000);
        await rejects(engine.answer(f.tx, f.playerId, runId, { value: true }, f.clock.now()), 409, /Apogee Run doesn't take \/answer/);

        // One submission of whatever kind came up, then let the rest time out
        const p = s.prompt!;
        const body = p.items ? { order: p.items } : p.options ? { option: p.options[0] } : { text: "zzzz qqqq" };
        const g = await engine.guess(f.tx, f.playerId, runId, body, f.clock.tick(1000));
        expect(g.state.mode).toBe("apogee");
        for (let cur = g.state; cur.status === "in_progress"; ) {
          const started = await start<DiveRunState>(f, runId);
          f.clock.t = Date.parse(started.prompt!.deadlineAt!);
          cur = await timeout<DiveRunState>(f, runId);
        }
        const r = await reveal<DiveReveal>(f, runId);
        expect(r).toMatchObject({ mode: "apogee", passed: false, summary: { mode: "apogee", outcome: "finished", stats: { prompts: 7 } } });
        expect(r.prompts).toHaveLength(7);
      }));
  });

  // ---------------------------------------------------------------------------------------
  describe("Leap", () => {
    async function correctId(f: F, s: LeapRunState): Promise<LeapOptionId> {
      const [a] = await f.tx<{ canonical: string }[]>`
        SELECT a.canonical FROM answers a JOIN prompts p ON p.id = a.prompt_id WHERE p.game_id = ${f.gameId} AND p.text = ${s.question!.text}`;
      return s.question!.options.find((o) => o.text === a.canonical)!.id;
    }
    const wrongId = async (f: F, s: LeapRunState, avoid: LeapOptionId[] = []) => {
      const right = await correctId(f, s);
      return s.question!.options.map((o) => o.id).find((id) => id !== right && !avoid.includes(id))!;
    };
    const answer = (f: F, runId: string, body: unknown) => engine.answer(f.tx, f.playerId, runId, body, f.clock.now()) as Promise<LeapAnswerResponse>;

    it("hides the question until its clock starts and never sends the correct option early", () =>
      withGame("leap", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        const [{ n }] = await f.tx`SELECT count(DISTINCT prompt_id)::int AS n FROM run_prompts WHERE run_id = ${runId}`;
        expect(n).toBe(10);
        const s0 = await state<LeapRunState>(f, runId);
        expect(s0).toMatchObject({ mode: "leap", position: 1, promptCount: 10, hearts: 3, maxHearts: 3, streak: 0, nextMultiplier: 1, lifelineAvailable: true, question: null, startedAt: null });
        await rejects(answer(f, runId, { optionId: "A" }), 409, /hasn't started/);
        await rejects(engine.guess(f.tx, f.playerId, runId, { text: "x" }, f.clock.now()), 409);

        const s1 = await start<LeapRunState>(f, runId);
        expect(s1.question!.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
        expect(Date.parse(s1.deadlineAt!) - f.clock.t).toBe(LEAP_QUESTION_MS);
        expect((await state<LeapRunState>(f, runId)).question).toEqual(s1.question); // stable across reloads
        const [p] = await f.tx<{ explanation: string; evidence_quote: string }[]>`
          SELECT p.explanation, a.evidence_quote FROM prompts p JOIN answers a ON a.prompt_id = p.id
           WHERE p.game_id = ${f.gameId} AND p.text = ${s1.question!.text}`;
        const json = JSON.stringify(s1);
        expect(json).not.toContain(p.explanation);
        expect(json).not.toContain(p.evidence_quote);
        expect(json).not.toMatch(/correctOption|isTrue|"answer/i);
        await rejects(answer(f, runId, { optionId: "E" }), 400);
        await rejects(answer(f, runId, { optionId: "A", position: 2 }), 409);
      }));

    it("scores speed × streak, halves after a 50/50, loses Hearts, and ends in a fall", () =>
      withGame("leap", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());

        // Q1: correct with 12 s left
        let s = await start<LeapRunState>(f, runId);
        f.clock.tick(3000);
        const r1 = await answer(f, runId, { optionId: await correctId(f, s), position: 1 });
        expect(r1.result).toMatchObject({ correct: true, points: 140, speedBonus: 40, multiplier: 1, halved: false });
        expect(r1.state).toMatchObject({ position: 2, streak: 1, score: 140, correctCount: 1, question: null });

        // Q2: 50/50 hides two wrong options and halves the points
        s = await start<LeapRunState>(f, runId);
        const ll = await engine.applyLifeline(f.tx, f.playerId, runId, undefined, f.clock.now());
        expect(ll.hiddenOptionIds).toHaveLength(2);
        expect(ll.hiddenOptionIds).not.toContain(await correctId(f, s));
        expect(ll.state.question!.hiddenOptionIds).toEqual(ll.hiddenOptionIds);
        expect((await engine.applyLifeline(f.tx, f.playerId, runId, { position: 2 }, f.clock.now())).hiddenOptionIds).toEqual(ll.hiddenOptionIds); // repeat is harmless
        await rejects(answer(f, runId, { optionId: ll.hiddenOptionIds[0] }), 400, /removed by the 50\/50/);
        const r2 = await answer(f, runId, { optionId: await correctId(f, s) });
        expect(r2.result).toMatchObject({ correct: true, points: 75, halved: true, multiplier: 1 });
        expect(r2.state.lifelineAvailable).toBe(false);

        // Q3: third in a row → ×1.5; the 50/50 is spent
        s = await start<LeapRunState>(f, runId);
        await rejects(engine.applyLifeline(f.tx, f.playerId, runId, undefined, f.clock.now()), 409, /already used/);
        const r3 = await answer(f, runId, { optionId: await correctId(f, s) });
        expect(r3.result).toMatchObject({ correct: true, points: 225, multiplier: 1.5 });

        // Q4 wrong, Q5 times out, Q6 arrives too late: three Hearts gone → fell
        s = await start<LeapRunState>(f, runId);
        const right4 = await correctId(f, s);
        const r4 = await answer(f, runId, { optionId: await wrongId(f, s) });
        expect(r4.result).toEqual({ correct: false, correctOptionId: right4, heartsLeft: 2, explanation: expect.any(String) });
        expect(r4.state).toMatchObject({ hearts: 2, streak: 0, nextMultiplier: 1 });

        s = await start<LeapRunState>(f, runId);
        f.clock.t = Date.parse(s.deadlineAt!) - 1000;
        expect((await timeout<LeapRunState>(f, runId)).position).toBe(5); // early: ignored
        f.clock.t = Date.parse(s.deadlineAt!);
        expect(await timeout<LeapRunState>(f, runId)).toMatchObject({ position: 6, hearts: 1 });

        s = await start<LeapRunState>(f, runId);
        f.clock.t = Date.parse(s.deadlineAt!) + 600;
        const r6 = await answer(f, runId, { optionId: await correctId(f, s) });
        expect(r6.result).toEqual({ correct: false, timedOut: true });
        expect(r6.state).toMatchObject({ status: "finished", outcome: "fell", hearts: 0, score: 440, question: null });

        const r = await reveal<LeapReveal>(f, runId);
        expect(r).toMatchObject({
          mode: "leap", score: 440, passed: false,
          summary: { mode: "leap", outcome: "fell", stats: { correct: 3, wrong: 1, timeouts: 2, heartsLeft: 0, bestStreak: 3, lifelineUsed: true } },
          progress: { isNewPersonalBest: true },
        });
        expect(r.questions).toHaveLength(10);
        expect(r.questions.map((q) => q.outcome)).toEqual(["correct", "correct", "correct", "wrong", "timeout", "timeout", null, null, null, null]);
        expect(r.questions[1]).toMatchObject({ lifelineUsed: true, hiddenOptionIds: ll.hiddenOptionIds, points: 75 });
        expect(r.questions[3].yourOptionId).not.toBe(r.questions[3].correctOptionId);
        expect(r.questions[0]).toMatchObject({ yourOptionId: r.questions[0].correctOptionId, evidence: { documentTitle: "week9.pptx", pageNumber: expect.any(Number), quote: expect.any(String) } });
        expect(r.questions[0].explanation).toBeTruthy();

        const events = await f.tx`SELECT match_method, is_correct, points, hint_used FROM guess_events WHERE run_id = ${runId} ORDER BY position`;
        expect(events.map((e) => [e.match_method, e.is_correct, e.points, e.hint_used])).toEqual([
          ["choice", true, 140, false], ["choice", true, 75, true], ["choice", true, 225, false], ["choice", false, 0, false],
        ]);
        expect(await engine.getRunSummary(f.tx, f.playerId, runId)).toEqual(r.summary);
      }));

    it("clears all 10 and passes", () =>
      withGame("leap", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        let s = await state<LeapRunState>(f, runId);
        while (s.status === "in_progress") {
          s = await start<LeapRunState>(f, runId);
          s = (await answer(f, runId, { optionId: await correctId(f, s) })).state;
        }
        // 150, 150, 225, 225, 300 × 6 = 2550
        expect(s).toMatchObject({ outcome: "cleared", hearts: 3, correctCount: 10, score: 2550 });
        expect(leapPoints(LEAP_QUESTION_MS, 5, false).points).toBe(300);
        const r = await reveal<LeapReveal>(f, runId);
        expect(r).toMatchObject({ passed: true, summary: { outcome: "cleared", stats: { correct: 10, bestStreak: 10 } } });
      }));
  });

  // ---------------------------------------------------------------------------------------
  describe("Pairs", () => {
    /** The current Board's correct pairing, from the database (definition text → term). */
    async function solution(f: F, s: PairsRunState) {
      const rows = await f.tx<{ text: string; canonical: string }[]>`
        SELECT p.text, a.canonical FROM prompts p JOIN answers a ON a.prompt_id = p.id WHERE p.game_id = ${f.gameId}`;
      const termOf = new Map(rows.map((r) => [r.text, r.canonical]));
      return s.current!.definitions.map((d) => ({
        definitionId: d.id,
        termId: s.current!.terms.find((t) => t.text === termOf.get(d.text))!.id,
      }));
    }
    const pair = (f: F, runId: string, body: unknown) => engine.pair(f.tx, f.playerId, runId, body, f.clock.now()) as Promise<PairResponse>;

    it("two Boards: matches, mismatches, a cleared Board's time bonus, then time runs out", () =>
      withGame("pairs", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        const terms = await f.tx<{ term: string }[]>`
          SELECT lower(a.canonical) AS term FROM run_prompts rp JOIN answers a ON a.prompt_id = rp.prompt_id WHERE rp.run_id = ${runId}`;
        expect(new Set(terms.map((t) => t.term)).size).toBe(12);

        const s0 = await state<PairsRunState>(f, runId);
        expect(s0).toMatchObject({ mode: "pairs", board: 1, boardCount: 2, pairsPerBoard: 6, boardsCleared: 0, current: null, startedAt: null });
        await rejects(pair(f, runId, { termId: "t1", definitionId: "d1" }), 409, /hasn't started/);

        let s = await start<PairsRunState>(f, runId);
        expect(s.current!.terms).toHaveLength(6);
        expect(s.current!.definitions).toHaveLength(6);
        const ids = [...s.current!.terms.map((t) => t.id), ...s.current!.definitions.map((d) => d.id)];
        expect(new Set(ids).size).toBe(12); // a term's id never equals its definition's
        expect(Date.parse(s.deadlineAt!) - f.clock.t).toBe(PAIRS_BOARD_MS);
        expect(await start<PairsRunState>(f, runId)).toEqual(s); // idempotent

        const sol = await solution(f, s);
        await rejects(pair(f, runId, { termId: "nope", definitionId: sol[0].definitionId }), 400);
        await rejects(pair(f, runId, { termId: sol[0].termId }), 400);

        // A mismatch at 0 points costs nothing but 2 s
        f.clock.tick(2000);
        const miss = await pair(f, runId, { termId: sol[0].termId, definitionId: sol[1].definitionId, board: 1 });
        expect(miss.result).toEqual({ correct: false, pointsLost: 0, penaltyMs: PAIRS_MISMATCH_PENALTY_MS });
        expect(Date.parse(miss.state.deadlineAt!)).toBe(Date.parse(s.deadlineAt!) - PAIRS_MISMATCH_PENALTY_MS);

        const hit = await pair(f, runId, sol[0]);
        expect(hit.result).toEqual({ correct: true, points: 50, ...sol[0], boardCleared: false, timeBonus: 0 });
        expect(hit.state.current!.matches).toEqual([sol[0]]);
        expect(hit.state.current!.terms.find((t) => t.id === sol[0].termId)!.matched).toBe(true);
        await rejects(pair(f, runId, sol[0]), 409, /already matched/);

        const miss2 = await pair(f, runId, { termId: sol[1].termId, definitionId: sol[2].definitionId });
        expect(miss2.result).toMatchObject({ correct: false, pointsLost: 10 });
        expect(miss2.state).toMatchObject({ score: 40, mistakes: 2 });

        let last: PairResponse | undefined;
        f.clock.tick(5000);
        for (const p of sol.slice(1)) last = await pair(f, runId, p);
        // 60 s − 2 × 2 s penalties − 7 s played = 49 s left → +245
        expect(last!.result).toEqual({ correct: true, points: 50, ...sol[5], boardCleared: true, timeBonus: timeBonus(49_000) });
        expect(last!.state).toMatchObject({ board: 2, boardsCleared: 1, current: null, mistakes: 0, score: 40 + 250 + 245 });

        // Board 2: two matches, then the clock runs out
        s = await start<PairsRunState>(f, runId);
        const sol2 = await solution(f, s);
        await pair(f, runId, sol2[0]);
        await pair(f, runId, sol2[1]);
        await rejects(pair(f, runId, { ...sol2[2], board: 1 }), 409, /already over/);
        f.clock.t = Date.parse(s.deadlineAt!) - 1000;
        expect((await timeout<PairsRunState>(f, runId)).status).toBe("in_progress"); // early: ignored
        f.clock.t = Date.parse(s.deadlineAt!) + 600;
        const late = await pair(f, runId, sol2[2]);
        expect(late.result).toEqual({ correct: false, timedOut: true });
        expect(late.state).toMatchObject({ status: "finished", outcome: "time_up", boardsCleared: 1, score: 635, current: null });

        const r = await reveal<PairsReveal>(f, runId);
        expect(r).toMatchObject({
          mode: "pairs", score: 635, passed: false,
          summary: { outcome: "time_up", stats: { boardsCleared: 1, matches: 8, mistakes: 2, timeBonus: 245 } },
        });
        expect(r.boards.map((b) => [b.cleared, b.mistakes, b.timeBonus, b.seconds, b.pairs.filter((p) => p.matched).length])).toEqual([
          [true, 2, 245, 7, 6], [false, 0, 0, 60, 2],
        ]);
        expect(r.boards[0].pairs[0]).toMatchObject({ term: expect.any(String), definition: expect.any(String), evidence: { pageNumber: expect.any(Number) } });

        const events = await f.tx`SELECT is_correct, points FROM guess_events WHERE run_id = ${runId} ORDER BY points, is_correct`;
        // Several share a fake-clock timestamp, so compare them sorted: 2 mismatches, 8 matches
        expect(events.map((e) => [e.is_correct, e.points])).toEqual([[false, -10], [false, 0], ...Array(8).fill([true, 50])]);
      }));

    it("clearing both Boards passes", () =>
      withGame("pairs", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        for (let b = 1; b <= 2; b++) {
          const s = await start<PairsRunState>(f, runId);
          f.clock.tick(10_000);
          for (const p of await solution(f, s)) await pair(f, runId, p);
        }
        const r = await reveal<PairsReveal>(f, runId);
        expect(r).toMatchObject({ passed: true, summary: { outcome: "cleared", stats: { boardsCleared: 2, matches: 12 } }, score: 2 * (300 + 250) });
      }));
  });

  // ---------------------------------------------------------------------------------------
  describe("Blitz", () => {
    const truth = async (f: F, s: BlitzRunState) => {
      const [p] = await f.tx<{ is_true: boolean }[]>`SELECT is_true FROM prompts WHERE game_id = ${f.gameId} AND text = ${s.statement!.text}`;
      return p.is_true;
    };
    const answer = (f: F, runId: string, body: unknown) => engine.answer(f.tx, f.playerId, runId, body, f.clock.now()) as Promise<BlitzAnswerResponse>;

    it("deals one statement at a time; combo doubles after 5; a miss costs 3 s; time runs out", () =>
      withGame("blitz", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        let s = await state<BlitzRunState>(f, runId);
        expect(s).toMatchObject({ mode: "blitz", position: 0, deckSize: 38, combo: 0, nextPoints: 10, statement: null, startedAt: null });
        await rejects(answer(f, runId, { value: true }), 409, /hasn't started/);

        s = await start<BlitzRunState>(f, runId);
        expect(s).toMatchObject({ position: 1, statement: { text: expect.any(String) } });
        expect(Date.parse(s.deadlineAt!) - f.clock.t).toBe(BLITZ_MS);
        expect(JSON.stringify(s)).not.toMatch(/isTrue|is_true|explanation/);
        await rejects(answer(f, runId, { value: "yes" }), 400);

        const points: number[] = [];
        for (let i = 0; i < 6; i++) {
          f.clock.tick(1000);
          const r = await answer(f, runId, { value: await truth(f, s), position: s.position });
          if (r.result.correct) points.push(r.result.points);
          s = r.state;
        }
        expect(points).toEqual([10, 10, 10, 10, 10, 20]);
        expect(s).toMatchObject({ position: 7, combo: 6, nextPoints: 20, score: 70, correctCount: 6 });
        await rejects(answer(f, runId, { value: true, position: 3 }), 409);

        const deadline = Date.parse(s.deadlineAt!);
        const isTrue = await truth(f, s);
        const miss = await answer(f, runId, { value: !isTrue });
        expect(miss.result).toEqual({ correct: false, isTrue, penaltyMs: BLITZ_PENALTY_MS, explanation: expect.any(String) });
        expect(miss.state).toMatchObject({ combo: 0, wrongCount: 1, position: 8 });
        expect(Date.parse(miss.state.deadlineAt!)).toBe(deadline - BLITZ_PENALTY_MS);

        f.clock.t = deadline - BLITZ_PENALTY_MS - 1000;
        expect((await timeout<BlitzRunState>(f, runId)).status).toBe("in_progress"); // early: ignored
        f.clock.t = deadline - BLITZ_PENALTY_MS;
        expect(await timeout<BlitzRunState>(f, runId)).toMatchObject({ status: "finished", outcome: "time_up", statement: null });

        const r = await reveal<BlitzReveal>(f, runId);
        expect(r).toMatchObject({ mode: "blitz", score: 70, passed: false, summary: { outcome: "time_up", stats: { answered: 7, correct: 6, wrong: 1, bestCombo: 6 } } });
        expect(r.statements).toHaveLength(8); // 7 answered + the one on screen when time ran out
        expect(r.statements[6]).toMatchObject({ correct: false, yourAnswer: !isTrue, isTrue });
        expect(r.statements[7]).toMatchObject({ yourAnswer: null, correct: false, points: 0 });
        expect(r.statements[0].evidence).toMatchObject({ documentTitle: "week9.pptx", quote: expect.any(String) });
      }));

    it("a late answer finishes the Run; answering the whole deck ends it early", () =>
      withGame("blitz", async (f) => {
        const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        const s = await start<BlitzRunState>(f, runId);
        f.clock.t = Date.parse(s.deadlineAt!) + 600;
        const late = await answer(f, runId, { value: true });
        expect(late.result).toEqual({ correct: false, timedOut: true });
        expect(late.state).toMatchObject({ status: "finished", outcome: "time_up" });

        const { runId: run2 } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
        let s2 = await start<BlitzRunState>(f, run2);
        while (s2.status === "in_progress") s2 = (await answer(f, run2, { value: await truth(f, s2) })).state;
        // 5 × 10 + 33 × 20
        expect(s2).toMatchObject({ outcome: "deck_cleared", correctCount: 38, score: 710 });
        expect((await reveal<BlitzReveal>(f, run2)).passed).toBe(true);
      }));
  });

  // ---------------------------------------------------------------------------------------
  it("Mode-specific routes refuse other Modes, and a Run stays private", () =>
    withGame("pairs", async (f) => {
      const { runId } = await engine.createRun(f.tx, f.playerId, f.gameId, f.clock.now());
      await rejects(engine.answer(f.tx, f.playerId, runId, { value: true }, f.clock.now()), 409, /Pairs Run doesn't take \/answer/);
      await rejects(engine.applyLifeline(f.tx, f.playerId, runId, undefined, f.clock.now()), 409);
      await rejects(engine.revealHint(f.tx, f.playerId, runId, f.clock.now()), 409);
      await rejects(engine.pair(f.tx, f.otherPlayerId, runId, {}, f.clock.now()), 404);
      await rejects(engine.getRunSummary(f.tx, f.playerId, runId), 409);
    }));
});
