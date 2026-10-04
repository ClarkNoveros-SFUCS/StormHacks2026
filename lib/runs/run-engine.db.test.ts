// Integration tests for the Run engine against Tiger Data. Run with `npm run test:db`.
// Each test builds a 7-Prompt Game (all five kinds) inside a rolled-back transaction and
// drives the engine with a fake clock, so nothing is left behind and nothing sleeps.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { normalize } from "@/lib/matching/normalize";
import {
  createRun, getReveal, getRunState, guess, PENALTY_MS, PROMPT_MS, revealHint, RunError, startPrompt, timeoutPrompt,
} from "./run-engine";
import type { PromptKind, RevealPrompt, RunState } from "./types";

type Tx = postgres.TransactionSql;
type Tier = "common" | "solid" | "deep" | "rare";
type AnswerSpec = { canonical: string; tier: Tier; aliases?: string[] };
type PromptSpec = {
  key: string; kind: PromptKind; text: string; tier?: Tier; hint?: string; explanation?: string;
  items?: string[]; options?: string[]; answers: AnswerSpec[];
};

const ORDER = ["Set distances to infinity", "Pick the closest unvisited vertex", "Relax its edges", "Mark it visited"];
const PROMPTS: PromptSpec[] = [
  { key: "open", kind: "open", text: "Name a graph algorithm", answers: [
    { canonical: "BFS", tier: "common", aliases: ["breadth-first search"] },
    { canonical: "DFS", tier: "solid" },
    { canonical: "Dijkstra", tier: "deep" },
    { canonical: "Bellman-Ford", tier: "rare" },
  ] },
  { key: "open2", kind: "open", text: "Name a minimum spanning tree algorithm", answers: [
    { canonical: "Kruskal", tier: "common" }, { canonical: "Prim", tier: "solid" }, { canonical: "Boruvka", tier: "rare" },
  ] },
  { key: "cloze", kind: "cloze", text: "Dijkstra fails with negative ____ weights", tier: "deep",
    hint: "It connects two vertices", explanation: "Relaxation assumes weights only grow.", answers: [{ canonical: "edge", tier: "deep" }] },
  { key: "cloze2", kind: "cloze", text: "A graph with no cycles is ____", tier: "common", answers: [{ canonical: "acyclic", tier: "common" }] },
  { key: "def", kind: "definition_to_term", text: "Visits all neighbours before going deeper", tier: "solid", hint: "Uses a queue",
    answers: [{ canonical: "breadth-first search", tier: "solid", aliases: ["BFS"] }] },
  { key: "order", kind: "ordered_recall", text: "Put Dijkstra's steps in order", tier: "solid", items: ORDER,
    answers: [{ canonical: "correct order", tier: "solid" }] },
  { key: "odd", kind: "odd_one_out", text: "Which is not a shortest-path algorithm?", tier: "rare", hint: "One of these builds trees",
    options: ["Dijkstra", "Bellman-Ford", "Floyd-Warshall", "Kruskal"], answers: [{ canonical: "Kruskal", tier: "rare" }] },
];
// A correct submission for each Prompt, by kind
const CORRECT: Record<string, object> = {
  open: { text: "breadth first search" }, open2: { text: "Kruskal" }, cloze: { text: "edge" }, cloze2: { text: "acyclic" },
  def: { text: "BFS" }, order: { order: ORDER }, odd: { option: "Kruskal" },
};
const KEY_BY_TEXT = new Map(PROMPTS.map((p) => [p.text, p.key]));

type Fixture = { tx: Tx; playerId: string; otherPlayerId: string; gameId: string; clock: Clock };

// A fake server clock: tests move it explicitly.
class Clock {
  t = Date.parse("2026-10-03T12:00:00Z");
  now() { return new Date(this.t); }
  tick(ms: number) { this.t += ms; return this.now(); }
}

class Rollback extends Error {}

async function withGame(fn: (f: Fixture) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f06_${randomUUID()}`;
      const otherPlayerId = `test_f06_${randomUUID()}`;
      await tx`INSERT INTO players (id) VALUES (${playerId}), (${otherPlayerId})`;
      const [mod] = await tx`INSERT INTO modules (player_id, name) VALUES (${playerId}, 'F06 test') RETURNING id`;
      const [doc] = await tx`
        INSERT INTO source_documents (module_id, player_id, filename, mime_type, size_bytes, status, page_count)
        VALUES (${mod.id}, ${playerId}, 'graphs.pdf', 'application/pdf', 1, 'parsed', 1) RETURNING id`;
      const [page] = await tx`
        INSERT INTO source_pages (source_document_id, page_index, page_number, content_md)
        VALUES (${doc.id}, 2, 3, 'graph notes') RETURNING id`;
      const [game] = await tx`
        INSERT INTO games (module_id, player_id, title, status, prompt_count)
        VALUES (${mod.id}, ${playerId}, 'F06 test', 'ready', ${PROMPTS.length}) RETURNING id`;

      for (const p of PROMPTS) {
        const oneShot = p.kind === "ordered_recall" || p.kind === "odd_one_out";
        const [prompt] = await tx`
          INSERT INTO prompts (game_id, source_document_id, kind, text, tier, hint, explanation, items, options, evidence_page_id)
          VALUES (${game.id}, ${doc.id}, ${p.kind}, ${p.text}, ${p.tier ?? null}, ${p.hint ?? null}, ${p.explanation ?? null},
                  ${p.items ? tx.json(p.items) : null}, ${p.options ? tx.json(p.options) : null}, ${oneShot ? page.id : null})
          RETURNING id`;
        for (const [rank, a] of p.answers.entries()) {
          const [answer] = await tx`
            INSERT INTO answers (prompt_id, canonical, tier, rarity_rank, evidence_page_id, evidence_quote)
            VALUES (${prompt.id}, ${a.canonical}, ${a.tier}, ${p.kind === "open" ? rank + 1 : null},
                    ${oneShot ? null : page.id}, ${`quote for ${a.canonical}`})
            RETURNING id`;
          if (!oneShot) {
            for (const key of [a.canonical, ...(a.aliases ?? [])]) {
              await tx`INSERT INTO answer_keys (prompt_id, normalized, answer_id, exact_only)
                       VALUES (${prompt.id}, ${normalize(key)}, ${answer.id}, false)`;
            }
          }
        }
      }
      await fn({ tx, playerId, otherPlayerId, gameId: game.id, clock: new Clock() });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const keyOf = (s: RunState) => KEY_BY_TEXT.get(s.prompt!.text)!;

// Start Prompts and let them time out until the current one is `key`; returns its started state.
async function skipTo(f: Fixture, runId: string, key: string): Promise<RunState> {
  for (;;) {
    const s = await startPrompt(f.tx, f.playerId, runId, f.clock.tick(1000));
    if (keyOf(s) === key) return s;
    await timeoutPrompt(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS));
  }
}

// createRun draws a random order; tests then put the Prompts in PROMPTS order so they can
// walk them predictably (skipTo only moves forward).
async function newRun(f: Fixture) {
  const { runId } = await createRun(f.tx, f.playerId, f.gameId, f.clock.tick(1000));
  const prompts = await f.tx<{ id: string; text: string }[]>`SELECT id, text FROM prompts WHERE game_id = ${f.gameId}`;
  const idByText = new Map(prompts.map((p) => [p.text, p.id]));
  await f.tx`DELETE FROM run_prompts WHERE run_id = ${runId}`;
  const rows = PROMPTS.map((p, i) => ({ run_id: runId, position: i + 1, prompt_id: idByText.get(p.text)! }));
  await f.tx`INSERT INTO run_prompts ${f.tx(rows, "run_id", "position", "prompt_id")}`;
  return runId;
}

async function rejects(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e) => e instanceof RunError && e.status === status);
}

async function runPrompt(tx: Tx, runId: string, position: number) {
  const [row] = await tx`SELECT * FROM run_prompts WHERE run_id = ${runId} AND position = ${position}`;
  return row;
}

describe.skipIf(!process.env.DATABASE_URL)("run engine", () => {
  afterAll(() => sql.end());

  it("creates a Run of 7 distinct Prompts and leaks no Answers or Hints", () =>
    withGame(async (f) => {
      const { runId: drawn } = await createRun(f.tx, f.playerId, f.gameId, f.clock.now());
      const [{ n }] = await f.tx`SELECT count(DISTINCT prompt_id)::int AS n FROM run_prompts WHERE run_id = ${drawn}`;
      expect(n).toBe(7);

      const runId = await newRun(f);

      const s = await getRunState(f.tx, f.playerId, runId, f.clock.now());
      expect(s).toMatchObject({ status: "in_progress", position: 1, promptCount: 7, score: 0 });
      expect(s.prompt).toMatchObject({ startedAt: null, deadlineAt: null, hintUsed: false });

      for (let position = 1; position <= 7; position++) {
        const started = await startPrompt(f.tx, f.playerId, runId, f.clock.tick(1000));
        const key = keyOf(started);
        expect(started.prompt!.hint).toBeUndefined();
        if (key === "order") {
          expect(started.prompt!.items).not.toEqual(ORDER);
          expect(started.prompt!.items).toEqual((await getRunState(f.tx, f.playerId, runId, f.clock.now())).prompt!.items); // stable
        }
        const spec = PROMPTS.find((p) => p.key === key)!;
        if (!spec.options && !spec.items) { // one-shot Prompts necessarily show their choices
          const json = JSON.stringify(started).toLowerCase();
          for (const secret of [...spec.answers.flatMap((a) => [a.canonical, ...(a.aliases ?? [])]), spec.hint ?? ""].filter(Boolean)) {
            expect(json).not.toContain(secret.toLowerCase());
          }
        }
        await timeoutPrompt(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS));
      }
    }));

  it("starting a new Run abandons the old one", () =>
    withGame(async (f) => {
      const first = await newRun(f);
      const second = await newRun(f);
      expect((await getRunState(f.tx, f.playerId, first, f.clock.now())).status).toBe("abandoned");
      expect((await getRunState(f.tx, f.playerId, second, f.clock.now())).status).toBe("in_progress");
      await rejects(startPrompt(f.tx, f.playerId, first, f.clock.now()), 409);
    }));

  it("keeps Runs private and rejects malformed ids", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await rejects(getRunState(f.tx, f.otherPlayerId, runId, f.clock.now()), 404);
      await rejects(createRun(f.tx, f.otherPlayerId, f.gameId, f.clock.now()), 404);
      await rejects(getRunState(f.tx, f.playerId, "not-a-uuid", f.clock.now()), 404);
    }));

  it("refuses a guess before the Prompt starts and validates the body", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await rejects(guess(f.tx, f.playerId, runId, { text: "BFS" }, f.clock.now()), 409);
      await startPrompt(f.tx, f.playerId, runId, f.clock.now());
      await rejects(guess(f.tx, f.playerId, runId, { text: "a", option: "b" }, f.clock.now()), 400);
      await rejects(guess(f.tx, f.playerId, runId, { text: "  " }, f.clock.now()), 400);
      await rejects(guess(f.tx, f.playerId, runId, null, f.clock.now()), 400);
      await rejects(guess(f.tx, f.playerId, runId, undefined, f.clock.now()), 400); // unparseable JSON
      await rejects(guess(f.tx, f.playerId, runId, { text: "x".repeat(501) }, f.clock.now()), 400);

      // NUL can't be stored in Postgres text; it's stripped, not a 500
      const nul = await guess(f.tx, f.playerId, runId, { text: "nope\u0000nope" }, f.clock.now());
      expect(nul.result).toEqual({ correct: false, penaltyMs: PENALTY_MS });
      const [event] = await f.tx`SELECT raw_text FROM guess_events WHERE run_id = ${runId}`;
      expect(event.raw_text).toBe("nopenope");
    }));

  it("a wrong typed guess costs 3 s; the first correct one scores and moves on", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      const started = await skipTo(f, runId, "open");
      const deadline = Date.parse(started.prompt!.deadlineAt!);

      const wrong = await guess(f.tx, f.playerId, runId, { text: "shortest path algorithm", position: started.position }, f.clock.tick(2000));
      expect(wrong.result).toEqual({ correct: false, penaltyMs: PENALTY_MS });
      expect(Date.parse(wrong.state.prompt!.deadlineAt!)).toBe(deadline - PENALTY_MS);

      const right = await guess(f.tx, f.playerId, runId, { text: "dijkstr" }, f.clock.tick(2000)); // typo, budget 1
      expect(right.result).toEqual({ correct: true, points: 60, answer: "Dijkstra", tier: "deep", stale: false });
      expect(right.state.position).toBe(started.position + 1);
      expect(right.state.score).toBe(60);
      expect(await runPrompt(f.tx, runId, started.position)).toMatchObject({ outcome: "correct", points: 60 });

      const events = await f.tx`SELECT * FROM guess_events WHERE run_id = ${runId} ORDER BY created_at`;
      expect(events.map((e) => [e.match_method, e.is_correct, e.points, e.ms_into_prompt])).toEqual([
        ["none", false, 0, 2000],
        ["typo", true, 60, 4000],
      ]);
      expect(events[1]).toMatchObject({ tier: "deep", distance: 1, normalized: "dijkstr", raw_text: "dijkstr" });

      // A repeat of the same guess (double submit) is refused, not applied to the next Prompt
      await rejects(guess(f.tx, f.playerId, runId, { text: "dijkstr", position: started.position }, f.clock.now()), 409);
    }));

  it("accepts a guess within 500 ms grace, and closes a later one as a timeout", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      const s1 = await skipTo(f, runId, "open");
      f.clock.t = Date.parse(s1.prompt!.deadlineAt!) + 400;
      expect((await guess(f.tx, f.playerId, runId, { text: "BFS" }, f.clock.now())).result.correct).toBe(true);

      const s2 = await skipTo(f, runId, "open2");
      f.clock.t = Date.parse(s2.prompt!.deadlineAt!) + 600;
      const late = await guess(f.tx, f.playerId, runId, { text: "Kruskal" }, f.clock.now());
      expect(late.result).toEqual({ correct: false, timedOut: true });
      expect(await runPrompt(f.tx, runId, s2.position)).toMatchObject({ outcome: "timeout", points: 0 });
    }));

  it("closes the Prompt when a penalty runs the clock out", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      const s = await skipTo(f, runId, "open");
      const after = await guess(f.tx, f.playerId, runId, { text: "nope nope" }, f.clock.tick(PROMPT_MS - 2000));
      expect(after.result).toEqual({ correct: false, penaltyMs: PENALTY_MS });
      expect(after.state.position).toBe(s.position + 1);
      expect(await runPrompt(f.tx, runId, s.position)).toMatchObject({ outcome: "timeout" });
    }));

  it("refuses an early /timeout but accepts one within 250 ms of the deadline", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      const s = await startPrompt(f.tx, f.playerId, runId, f.clock.now());
      const deadline = Date.parse(s.prompt!.deadlineAt!);

      f.clock.t = deadline - 1000;
      expect((await timeoutPrompt(f.tx, f.playerId, runId, f.clock.now())).position).toBe(1);
      f.clock.t = deadline - 200;
      expect((await timeoutPrompt(f.tx, f.playerId, runId, f.clock.now())).position).toBe(2);
      expect(await runPrompt(f.tx, runId, 1)).toMatchObject({ outcome: "timeout", points: 0 });
    }));

  it("any late request closes the expired Prompt first", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await startPrompt(f.tx, f.playerId, runId, f.clock.now());
      const s = await getRunState(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS + 5000)); // tab was closed
      expect(s.position).toBe(2);
      expect(s.prompt!.startedAt).toBeNull();
      expect(await runPrompt(f.tx, runId, 1)).toMatchObject({ outcome: "timeout" });

      // start-prompt that closes an expired Prompt doesn't also start the next one's clock
      await startPrompt(f.tx, f.playerId, runId, f.clock.now());
      const s3 = await startPrompt(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS + 5000));
      expect(s3).toMatchObject({ position: 3, prompt: { startedAt: null } });
    }));

  it("one-shot Prompts: a wrong submission ends the Prompt and shows the answer", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await skipTo(f, runId, "order");
      await rejects(guess(f.tx, f.playerId, runId, { order: ORDER.slice(1) }, f.clock.now()), 400);
      await rejects(guess(f.tx, f.playerId, runId, { text: "x" }, f.clock.now()), 400);
      const right = await guess(f.tx, f.playerId, runId, { order: ORDER }, f.clock.tick(1000));
      expect(right.result).toEqual({ correct: true, points: 25, answer: ORDER.join(" → "), tier: "solid", stale: false });

      await skipTo(f, runId, "odd");
      await rejects(guess(f.tx, f.playerId, runId, { option: "Floyd" }, f.clock.now()), 400);
      const wrong = await guess(f.tx, f.playerId, runId, { option: "Dijkstra" }, f.clock.tick(1000));
      expect(wrong.result).toEqual({ correct: false, answer: "Kruskal" });
      expect(wrong.state.status).toBe("finished");

      const events = await f.tx`SELECT match_method, is_correct, raw_text FROM guess_events WHERE run_id = ${runId} ORDER BY created_at`;
      expect(events.map((e) => e.match_method)).toEqual(["choice", "choice"]);
      expect(events.map((e) => e.raw_text)).toEqual([JSON.stringify(ORDER), '"Dijkstra"']);
    }));

  it("a Hint drops the Prompt one Tier; Open Prompts and hintless ones have none", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await skipTo(f, runId, "open");
      await rejects(revealHint(f.tx, f.playerId, runId, f.clock.now()), 409);
      await timeoutPrompt(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS));

      const s = await skipTo(f, runId, "cloze");
      expect(s.prompt).toMatchObject({ hintAvailable: true, hintUsed: false });
      const h = await revealHint(f.tx, f.playerId, runId, f.clock.tick(1000));
      expect(h.hint).toBe("It connects two vertices");
      expect(h.state.prompt).toMatchObject({ hintUsed: true, hint: "It connects two vertices" });
      const right = await guess(f.tx, f.playerId, runId, { text: "edge" }, f.clock.tick(1000));
      expect(right.result).toMatchObject({ correct: true, points: 25, tier: "deep" });

      const s2 = await skipTo(f, runId, "cloze2");
      expect(s2.prompt!.hintAvailable).toBe(false);
      await rejects(revealHint(f.tx, f.playerId, runId, f.clock.now()), 409);
    }));

  it("Staleness halves an Open Answer per earlier Run that scored it", () =>
    withGame(async (f) => {
      const points: number[] = [];
      for (let i = 0; i < 3; i++) {
        const runId = await newRun(f);
        await skipTo(f, runId, "open");
        const r = await guess(f.tx, f.playerId, runId, { text: "BFS" }, f.clock.tick(1000));
        if (r.result.correct) points.push(r.result.points);
        expect(r.result).toMatchObject({ correct: true, stale: i > 0 });
      }
      expect(points).toEqual([10, 5, 2]);
    }));

  it("finishes after 7 Prompts, then opens the Reveal", () =>
    withGame(async (f) => {
      const runId = await newRun(f);
      await rejects(getReveal(f.tx, f.playerId, runId), 409);

      let state = await getRunState(f.tx, f.playerId, runId, f.clock.now());
      let expected = 0;
      while (state.status === "in_progress") {
        state = await startPrompt(f.tx, f.playerId, runId, f.clock.tick(1000));
        const key = keyOf(state);
        if (key === "cloze2") {
          state = await timeoutPrompt(f.tx, f.playerId, runId, f.clock.tick(PROMPT_MS));
          continue;
        }
        const { result, state: next } = await guess(f.tx, f.playerId, runId, CORRECT[key], f.clock.tick(1000));
        if (result.correct) expected += result.points;
        state = next;
      }
      expect(state).toMatchObject({ status: "finished", position: 7, prompt: null, score: expected });
      expect(expected).toBe(10 + 10 + 60 + 25 + 25 + 100); // BFS, Kruskal, edge, def, order, odd
      await rejects(guess(f.tx, f.playerId, runId, { text: "x" }, f.clock.now()), 409);

      const reveal = await getReveal(f.tx, f.playerId, runId);
      expect(reveal).toMatchObject({ runId, gameId: f.gameId, score: expected, progress: null });
      const byKey: Record<string, RevealPrompt> = Object.fromEntries(reveal.prompts.map((p) => [KEY_BY_TEXT.get(p.text), p]));
      expect(byKey.open.answers!.map((a) => [a.answer, a.tier, a.found])).toEqual([
        ["BFS", "common", true], ["DFS", "solid", false], ["Dijkstra", "deep", false], ["Bellman-Ford", "rare", false],
      ]);
      expect(byKey.open.answers![0].evidence).toEqual({ documentTitle: "graphs.pdf", pageNumber: 3, quote: "quote for BFS" });
      expect(byKey.open).toMatchObject({ yourAnswer: "BFS", outcome: "correct", stale: false });
      expect(byKey.cloze).toMatchObject({ correctAnswer: "edge", explanation: "Relaxation assumes weights only grow.", tier: "deep" });
      expect(byKey.cloze2).toMatchObject({ outcome: "timeout", points: 0, yourAnswer: null, correctAnswer: "acyclic" });
      expect(byKey.order).toMatchObject({ correctOrder: ORDER, evidence: { pageNumber: 3 } });
      expect(byKey.odd).toMatchObject({ correctAnswer: "Kruskal", yourAnswer: "Kruskal", points: 100 });

      await rejects(getReveal(f.tx, f.otherPlayerId, runId), 404);
    }));
});
