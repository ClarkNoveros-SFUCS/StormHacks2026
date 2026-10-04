// Integration tests for matchGuess against Tiger Data. Run with `npm run test:db`
// (needs DATABASE_URL in .env.local). Every test builds its own fixture inside a
// transaction that is rolled back, so nothing is left in the database.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { matchGuess, type MatchResult } from "./match-guess";
import { normalize } from "./normalize";

type Fixture = { tx: postgres.TransactionSql; graphPromptId: string; tiePromptId: string; answerIds: Record<string, string> };

// "Name a graph algorithm": canonical name → Aliases (plus exact_only flag)
const GRAPH_ANSWERS: { canonical: string; aliases: string[]; exactOnly?: boolean }[] = [
  { canonical: "Dijkstra", aliases: ["Dijkstra's algorithm"] },
  { canonical: "Bellman-Ford", aliases: [] },
  { canonical: "BFS", aliases: ["breadth-first search"] },
  { canonical: "DFS", aliases: ["depth-first search"] },
  { canonical: "Prim", aliases: [] },
  { canonical: "Kruskal", aliases: [] },
  { canonical: "Tarjan", aliases: [], exactOnly: true },
];
// Two Answers one edit apart, so a guess between them is ambiguous
const TIE_ANSWERS = [
  { canonical: "alpha beta", aliases: [] },
  { canonical: "alpha bets", aliases: [] },
];

class Rollback extends Error {}

async function withFixture(fn: (f: Fixture) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f05_${randomUUID()}`;
      await tx`INSERT INTO players (id) VALUES (${playerId})`;
      const [mod] = await tx`INSERT INTO modules (player_id, name) VALUES (${playerId}, 'F05 test') RETURNING id`;
      const [doc] = await tx`
        INSERT INTO source_documents (module_id, player_id, filename, mime_type, size_bytes, status)
        VALUES (${mod.id}, ${playerId}, 'graphs.pdf', 'application/pdf', 1, 'parsed') RETURNING id`;
      const [game] = await tx`
        INSERT INTO games (module_id, player_id, title, status) VALUES (${mod.id}, ${playerId}, 'F05 test', 'ready') RETURNING id`;

      const answerIds: Record<string, string> = {};
      const addPrompt = async (text: string, answers: typeof GRAPH_ANSWERS) => {
        const [prompt] = await tx`
          INSERT INTO prompts (game_id, source_document_id, kind, text)
          VALUES (${game.id}, ${doc.id}, 'open', ${text}) RETURNING id`;
        for (const [rank, a] of answers.entries()) {
          const exactOnly = a.exactOnly ?? false;
          const [answer] = await tx`
            INSERT INTO answers (prompt_id, canonical, tier, rarity_rank, exact_only)
            VALUES (${prompt.id}, ${a.canonical}, 'common', ${rank + 1}, ${exactOnly}) RETURNING id`;
          answerIds[a.canonical] = answer.id;
          for (const key of [a.canonical, ...a.aliases]) {
            await tx`
              INSERT INTO answer_keys (prompt_id, normalized, answer_id, exact_only)
              VALUES (${prompt.id}, ${normalize(key)}, ${answer.id}, ${exactOnly})`;
          }
        }
        return prompt.id as string;
      };

      const graphPromptId = await addPrompt("Name a graph algorithm", GRAPH_ANSWERS);
      const tiePromptId = await addPrompt("Ambiguity fixture", TIE_ANSWERS);
      await fn({ tx, graphPromptId, tiePromptId, answerIds });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

function expectMatch(result: MatchResult, answerId: string, method: "exact" | "typo", distance: number) {
  expect(result).toEqual({ matched: true, answerId, method, distance });
}

describe.skipIf(!process.env.DATABASE_URL)("matchGuess", () => {
  afterAll(() => sql.end());

  it("spec worked examples", () =>
    withFixture(async ({ tx, graphPromptId: p, answerIds: ids }) => {
      expectMatch(await matchGuess(p, "Dijkstra's", tx), ids["Dijkstra"], "exact", 0);
      expectMatch(await matchGuess(p, "bellman fod", tx), ids["Bellman-Ford"], "typo", 1);
      expectMatch(await matchGuess(p, "breadth first search", tx), ids["BFS"], "exact", 0);
      expectMatch(await matchGuess(p, "dfs", tx), ids["DFS"], "exact", 0);
      expect(await matchGuess(p, "shortest path algorithm", tx)).toEqual({ matched: false, method: "none" });
      expect(await matchGuess(p, "A*", tx)).toEqual({ matched: false, method: "none" });
    }));

  it("BFS and DFS never fuzzy-match each other (length-3 budget is 0)", () =>
    withFixture(async ({ tx, graphPromptId: p, answerIds: ids }) => {
      expectMatch(await matchGuess(p, "BFS", tx), ids["BFS"], "exact", 0);
      expectMatch(await matchGuess(p, "DFS", tx), ids["DFS"], "exact", 0);
      expect(await matchGuess(p, "cfs", tx)).toEqual({ matched: false, method: "none" });
      expect(await matchGuess(p, "bds", tx)).toEqual({ matched: false, method: "none" });
    }));

  it("applies the length budget: 1 edit for 5–8 chars, 2 for ≥ 9", () =>
    withFixture(async ({ tx, graphPromptId: p, answerIds: ids }) => {
      expectMatch(await matchGuess(p, "kruskel", tx), ids["Kruskal"], "typo", 1);
      expect(await matchGuess(p, "krusskel", tx)).toEqual({ matched: false, method: "none" }); // 2 edits, budget 1
      expectMatch(await matchGuess(p, "dijkstr algoritm", tx), ids["Dijkstra"], "typo", 2); // alias, 2 edits
      expect(await matchGuess(p, "prym", tx)).toEqual({ matched: false, method: "none" }); // < 5 chars
    }));

  it("respects exact_only: exact match only, never by typo", () =>
    withFixture(async ({ tx, graphPromptId: p, answerIds: ids }) => {
      expectMatch(await matchGuess(p, "Tarjan", tx), ids["Tarjan"], "exact", 0);
      expect(await matchGuess(p, "tarjen", tx)).toEqual({ matched: false, method: "none" });
    }));

  it("refuses a typo within reach of two Answers", () =>
    withFixture(async ({ tx, tiePromptId: p, answerIds: ids }) => {
      expect(await matchGuess(p, "alpha betz", tx)).toEqual({ matched: false, method: "ambiguous" });
      expectMatch(await matchGuess(p, "alpha bets", tx), ids["alpha bets"], "exact", 0);
    }));

  it("only matches the given Prompt's Answers", () =>
    withFixture(async ({ tx, graphPromptId, tiePromptId }) => {
      expect(await matchGuess(graphPromptId, "alpha beta", tx)).toEqual({ matched: false, method: "none" });
      expect(await matchGuess(tiePromptId, "Dijkstra", tx)).toEqual({ matched: false, method: "none" });
    }));

  it("handles empty and over-long guesses without querying fuzzily", () =>
    withFixture(async ({ tx, graphPromptId: p }) => {
      expect(await matchGuess(p, "   ", tx)).toEqual({ matched: false, method: "none" });
      expect(await matchGuess(p, "x".repeat(300), tx)).toEqual({ matched: false, method: "none" });
    }));
});
