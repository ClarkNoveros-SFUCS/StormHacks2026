// Integration tests for generateGame against Tiger Data, with a fake Gemini. Run with
// `npm run test:db` (needs DATABASE_URL in .env.local and the games.mode migration).
// Every test builds its fixture inside a transaction that is rolled back.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import modesFixture from "@/db/seed/graph-algorithms-modes.json";
import { sql } from "@/lib/db";
import { GeminiError } from "@/lib/gemini";
import { normalize } from "@/lib/matching/normalize";
import { generateGame, NOT_ENOUGH_CONTENT, type Verify } from "./generate-game";
import { verifyDocument } from "./verify";

type Fixture = { tx: postgres.TransactionSql; gameId: string; documentIds: string[] };

class Rollback extends Error {}

/** A Player, a Module, `docs` parsed copies of the seed deck, and a queued Game using all of them. */
async function withFixture(fn: (f: Fixture) => Promise<void>, { docs = 1, status = "queued", mode = "dive" } = {}) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f04_${randomUUID()}`;
      await tx`insert into players (id) values (${playerId})`;
      const [mod] = await tx`insert into modules (player_id, name) values (${playerId}, 'F04 test') returning id`;
      const documentIds: string[] = [];
      for (let i = 0; i < docs; i++) {
        const [doc] = await tx`
          insert into source_documents (module_id, player_id, filename, mime_type, size_bytes, status, page_count)
          values (${mod.id}, ${playerId}, ${`deck-${i}.pptx`}, ${fixture.document.mime_type}, 1, 'parsed',
                  ${fixture.document.pages.length})
          returning id`;
        await tx`insert into source_pages ${tx(
          fixture.document.pages.map((p) => ({
            source_document_id: doc.id,
            page_index: p.page_number - 1,
            page_number: p.page_number,
            content_md: p.content_md,
          })),
        )}`;
        documentIds.push(doc.id);
      }
      const [game] = await tx`
        insert into games (module_id, player_id, title, status, mode) values (${mod.id}, ${playerId}, 'F04 test', ${status}, ${mode})
        returning id`;
      await tx`insert into game_sources ${tx(documentIds.map((id) => ({ game_id: game.id, source_document_id: id })))}`;
      await fn({ tx, gameId: game.id, documentIds });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const fake = (prompts: unknown[]) => async () => ({ response: { prompts } });
const game = async (tx: postgres.TransactionSql, id: string) =>
  (await tx`select status, error, prompt_count, mode from games where id = ${id}`)[0];

describe("generateGame", () => {
  it("stores a ready Game: Prompts, Answers with Tiers and Evidence, normalized answer_keys", () =>
    withFixture(async ({ tx, gameId, documentIds }) => {
      const result = await generateGame(gameId, { db: tx, generate: fake(fixture.game.prompts) });
      expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
      expect(await game(tx, gameId)).toMatchObject({ status: "ready", error: null, prompt_count: 12, mode: "dive" });

      const prompts = await tx`select * from prompts where game_id = ${gameId}`;
      expect(prompts).toHaveLength(12);
      expect(prompts.every((p) => p.source_document_id === documentIds[0])).toBe(true);
      expect(prompts.filter((p) => p.kind === "open").every((p) => p.tier === null && p.hint === null)).toBe(true);
      const ordered = prompts.find((p) => p.kind === "ordered_recall")!;
      expect(Array.isArray(ordered.items)).toBe(true); // jsonb array, not a jsonb string
      expect(ordered.evidence_page_id).not.toBeNull();

      const answers = await tx`
        select a.*, sp.page_number from answers a
        join prompts p on p.id = a.prompt_id
        join source_pages sp on sp.id = a.evidence_page_id
        where p.game_id = ${gameId}`;
      expect(answers).toHaveLength(30);
      const graph = fixture.game.prompts[0];
      const graphAnswers = answers
        .filter((a) => graph.answers!.some((g) => g.canonical === a.canonical) && a.rarity_rank !== null)
        .sort((a, b) => a.rarity_rank - b.rarity_rank);
      expect(graphAnswers.at(-1)!.tier).toBe("rare");
      // An Open Prompt's BFS (odd_one_out's "BFS" option is stored exact_only false; rows come in no order)
      expect(answers.find((a) => a.canonical === "BFS" && a.rarity_rank !== null)).toMatchObject({ exact_only: true, page_number: 2 });

      const keys = await tx`
        select k.normalized, a.canonical from answer_keys k join answers a on a.id = k.answer_id
        join prompts p on p.id = k.prompt_id where p.game_id = ${gameId}`;
      expect(keys).toHaveLength(80);
      expect(keys.every((k) => k.normalized === normalize(k.normalized))).toBe(true);
      expect(keys).toContainEqual({ normalized: "breadth first search", canonical: "BFS" });
    }));

  it("dedupes the same Prompt across two documents (check 7) and calls Gemini once per document", () =>
    withFixture(
      async ({ tx, gameId }) => {
        const calls: string[] = [];
        const result = await generateGame(gameId, {
          db: tx,
          generate: async (title) => (calls.push(title), { response: { prompts: fixture.game.prompts } }),
        });
        expect(calls.sort()).toEqual(["deck-0.pptx", "deck-1.pptx"]);
        expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 12 });
      },
      { docs: 2 },
    ));

  it("fails with a readable error when fewer than 7 Prompts survive", () =>
    withFixture(async ({ tx, gameId }) => {
      const result = await generateGame(gameId, { db: tx, generate: fake(fixture.game.prompts.slice(0, 6)) });
      expect(result).toEqual({ status: "failed", error: NOT_ENOUGH_CONTENT });
      expect(await game(tx, gameId)).toMatchObject({ status: "failed", error: NOT_ENOUGH_CONTENT, prompt_count: null });
      expect(await tx`select 1 from prompts where game_id = ${gameId}`).toHaveLength(0);
    }));

  it("fails with a user-facing message when Gemini fails", () =>
    withFixture(async ({ tx, gameId }) => {
      const result = await generateGame(gameId, {
        db: tx,
        generate: async () => {
          throw new GeminiError("Gemini request failed 503: overloaded");
        },
      });
      expect(result).toMatchObject({ status: "failed", error: expect.stringMatching(/question generator/) });
      expect((await game(tx, gameId)).status).toBe("failed");
    }));

  // ---- Verification pass (F16) ----
  /** A Verify that runs the real merge/drop logic with a fake verifier rejecting the given Answer ids. */
  const verifyRejecting =
    (...rejected: string[]): Verify =>
    (title, pages, prompts) =>
      verifyDocument(title, pages, prompts, async (_t, input) => ({
        response: {
          prompts: input.questions.map((q) => ({
            id: q.id,
            clear: true,
            duplicate_of: "",
            answers: q.answers.map((a) => ({ id: a.id, supports: !rejected.includes(a.id) })),
          })),
        },
      }));

  it("verification pass: unsupported Answers and their single-answer Prompts aren't stored; Tiers are reassigned", () =>
    withFixture(async ({ tx, gameId }) => {
      // P1 "Name a graph algorithm" loses one of its 13 Answers; P4 (a cloze) loses its only Answer
      const result = await generateGame(gameId, { db: tx, generate: fake(fixture.game.prompts), verify: verifyRejecting("P1.A2", "P4.A1") });
      expect(result).toEqual({ status: "ready", promptCount: 11, dropped: 2 });
      const graph = await tx`
        select a.canonical, a.tier, a.rarity_rank from answers a join prompts p on p.id = a.prompt_id
        where p.game_id = ${gameId} and p.text = ${fixture.game.prompts[0].text} order by a.rarity_rank`;
      expect(graph.map((a) => a.canonical)).not.toContain(fixture.game.prompts[0].answers![1].canonical);
      expect(graph.map((a) => a.rarity_rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(graph.at(-1)!.tier).toBe("rare");
      expect(await tx`select 1 from prompts where game_id = ${gameId} and text = ${fixture.game.prompts[3].text}`).toHaveLength(0);
    }));

  it("verification pass: a failed verification call keeps the unverified Prompts and the Game is ready", () =>
    withFixture(async ({ tx, gameId }) => {
      const verify: Verify = (title, pages, prompts) =>
        verifyDocument(title, pages, prompts, async () => {
          throw new GeminiError("Gemini request failed 503: overloaded");
        });
      expect(await generateGame(gameId, { db: tx, generate: fake(fixture.game.prompts), verify })).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
    }));

  // ---- Overgenerate and select (F17) ----
  it("overgenerate: asks for about 25 Prompts and stores only the selected ones", () =>
    withFixture(async ({ tx, gameId }) => {
      const reworded = { ...fixture.game.prompts[0], text: "Give an example of an algorithm on graphs" }; // same Answers
      const requests: string[] = [];
      const result = await generateGame(gameId, {
        db: tx,
        overgenerate: true,
        generate: async (_title, pages, request) => (
          requests.push(request.contents("deck", pages)), { response: { prompts: [...fixture.game.prompts, reworded] } }
        ),
      });
      expect(requests[0]).toMatch(/Write about 25 Prompts/);
      expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 1 });
      expect(await tx`select 1 from prompts where game_id = ${gameId} and text = ${reworded.text}`).toHaveLength(0);
    }));

  it("overgenerate off: the usual request and no selection", () =>
    withFixture(async ({ tx, gameId }) => {
      const requests: string[] = [];
      const result = await generateGame(gameId, {
        db: tx,
        overgenerate: false,
        generate: async (_title, pages, request) => (requests.push(request.contents("deck", pages)), { response: { prompts: fixture.game.prompts } }),
      });
      expect(requests[0]).toMatch(/Write 15-20 Prompts/);
      expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
    }));

  // ---- Split generation (F30) ----
  it("split: sends Dive's two calls per document and stores both calls' Prompts", () =>
    withFixture(async ({ tx, gameId }) => {
      const open = fixture.game.prompts.filter((p) => p.kind === "open");
      const other = fixture.game.prompts.filter((p) => p.kind !== "open");
      const asked: string[] = [];
      const result = await generateGame(gameId, {
        db: tx,
        split: true,
        generate: async (_title, pages, request) => {
          const text = request.contents("deck", pages);
          asked.push(text.slice(text.lastIndexOf("\n") + 1));
          return { response: { prompts: /Write [0-9-]+ "open"/.test(text) ? open : other } };
        },
      });
      expect(asked.sort()).toEqual([
        'Write 7-10 non-"open" Prompts for this document following your instructions.',
        'Write 8-10 "open" Prompts for this document following your instructions.',
      ]);
      expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
    }));

  it("split: one failed call keeps the other call's Prompts", () =>
    withFixture(async ({ tx, gameId }) => {
      const result = await generateGame(gameId, {
        db: tx,
        split: true,
        generate: async (_title, pages, request) => {
          if (/Write [0-9-]+ "open"/.test(request.contents("deck", pages))) throw new GeminiError("503 high demand");
          return { response: { prompts: fixture.game.prompts } };
        },
      });
      expect(result).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
    }));

  it("split: every call failing fails the Game with the generator message", () =>
    withFixture(async ({ tx, gameId }) => {
      const result = await generateGame(gameId, {
        db: tx,
        split: true,
        generate: async () => {
          throw new GeminiError("503 high demand");
        },
      });
      expect(result).toEqual({ status: "failed", error: "We couldn't reach the question generator. Delete this Game and try again" });
    }));

  // ---- Other Modes (F20): the Mode picks the Gemini request, the checks and the minimum ----
  const modePrompts = (mode: string) => modesFixture.games.find((g) => g.mode === mode)!.prompts!;

  it("Leap: passes its own request to Gemini and stores multiple_choice Prompts with Evidence", () =>
    withFixture(
      async ({ tx, gameId }) => {
        const requests: string[] = [];
        const result = await generateGame(gameId, {
          db: tx,
          generate: async (_title, _pages, request) => (requests.push(request.systemInstruction), { response: { prompts: modePrompts("leap") } }),
        });
        expect(result).toEqual({ status: "ready", promptCount: 14, dropped: 0 });
        expect(requests[0]).toMatch(/multiple-choice/);
        const rows = await tx`
          select p.kind, p.options, p.tier, p.is_true, a.canonical, a.evidence_quote, a.evidence_page_id
          from prompts p join answers a on a.prompt_id = p.id where p.game_id = ${gameId}`;
        expect(rows).toHaveLength(14);
        for (const r of rows) {
          expect(r).toMatchObject({ kind: "multiple_choice", is_true: null, evidence_quote: expect.any(String), evidence_page_id: expect.any(String) });
          expect(r.options).toHaveLength(4);
          expect(r.options).toContain(r.canonical);
        }
        expect(await tx`select 1 from answer_keys k join prompts p on p.id = k.prompt_id where p.game_id = ${gameId}`).toHaveLength(0);
      },
      { mode: "leap" },
    ));

  it("Blitz: stores is_true and balances true/false", () =>
    withFixture(
      async ({ tx, gameId }) => {
        expect(await generateGame(gameId, { db: tx, generate: fake(modePrompts("blitz")) })).toMatchObject({ status: "ready", promptCount: 38 });
        const rows = await tx`select p.is_true, a.canonical from prompts p join answers a on a.prompt_id = p.id where p.game_id = ${gameId}`;
        expect(rows.filter((r) => r.is_true)).toHaveLength(19);
        expect(rows.every((r) => r.canonical === (r.is_true ? "True" : "False"))).toBe(true);
      },
      { mode: "blitz" },
    ));

  it("Pairs: fails with a readable error below 12 distinct pairs", () =>
    withFixture(
      async ({ tx, gameId }) => {
        const result = await generateGame(gameId, { db: tx, generate: fake(modePrompts("pairs").slice(0, 11)) });
        expect(result).toEqual({ status: "failed", error: expect.stringMatching(/^Not enough usable content to make a Game: a Pairs Game needs 12 .* only 11/) });
        expect(await game(tx, gameId)).toMatchObject({ status: "failed", mode: "pairs" });
      },
      { mode: "pairs" },
    ));

  it("Apogee uses Dive's generator", () =>
    withFixture(
      async ({ tx, gameId }) => {
        expect(await generateGame(gameId, { db: tx, generate: fake(fixture.game.prompts) })).toEqual({ status: "ready", promptCount: 12, dropped: 0 });
      },
      { mode: "apogee" },
    ));

  it("refuses a reserved Mode", () =>
    withFixture(
      async ({ tx, gameId }) => {
        expect(await generateGame(gameId, { db: tx, generate: fake([]) })).toEqual({ status: "failed", error: "This Game Mode can't be generated yet" });
      },
      { mode: "arena" },
    ));

  it("leaves a Game that isn't queued alone", () =>
    withFixture(
      async ({ tx, gameId }) => {
        let called = false;
        const result = await generateGame(gameId, { db: tx, generate: async () => ((called = true), { response: {} }) });
        expect(result).toEqual({ status: "skipped" });
        expect(called).toBe(false);
        expect((await game(tx, gameId)).status).toBe("ready");
      },
      { status: "ready" },
    ));
});
