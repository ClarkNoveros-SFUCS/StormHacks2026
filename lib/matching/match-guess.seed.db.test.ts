// matchGuess against F02's seeded "Graph Algorithms" Answers (db/seed/graph-algorithms.json).
// Run with `npm run test:db`. Builds the typed Prompts' Answers and answer_keys the same way
// scripts/seed.mts does (canonical + Aliases, normalized, exact_only copied from the Answer),
// inside a transaction that is rolled back.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { matchGuess, type MatchResult } from "./match-guess";
import { normalize } from "./normalize";

type SeedAnswer = { canonical: string; aliases: string[]; exact_only: boolean };
type SeedPrompt = { kind: string; text: string; answers?: SeedAnswer[] };

const fixture: { game: { prompts: SeedPrompt[] } } = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../db/seed/graph-algorithms.json"), "utf8"),
);
const typed = fixture.game.prompts.filter((p) => p.answers?.length);

// Prompt text → { promptId, answer canonical → answerId }
type Seeded = Map<string, { promptId: string; ids: Record<string, string> }>;

class Rollback extends Error {}

async function withSeed(fn: (tx: postgres.TransactionSql, seeded: Seeded) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f05_seed_${randomUUID()}`;
      await tx`INSERT INTO players (id) VALUES (${playerId})`;
      const [mod] = await tx`INSERT INTO modules (player_id, name) VALUES (${playerId}, 'F05 seed test') RETURNING id`;
      const [doc] = await tx`
        INSERT INTO source_documents (module_id, player_id, filename, mime_type, size_bytes, status)
        VALUES (${mod.id}, ${playerId}, 'graphs.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 1, 'parsed')
        RETURNING id`;
      const [game] = await tx`
        INSERT INTO games (module_id, player_id, title, status) VALUES (${mod.id}, ${playerId}, 'F05 seed test', 'ready') RETURNING id`;

      const seeded: Seeded = new Map();
      for (const p of typed) {
        const [prompt] = await tx`
          INSERT INTO prompts (game_id, source_document_id, kind, text, tier)
          VALUES (${game.id}, ${doc.id}, ${p.kind}, ${p.text}, ${p.kind === "open" ? null : "common"}) RETURNING id`;
        const ids: Record<string, string> = {};
        for (const [i, a] of p.answers!.entries()) {
          const [answer] = await tx`
            INSERT INTO answers (prompt_id, canonical, tier, rarity_rank, exact_only)
            VALUES (${prompt.id}, ${a.canonical}, 'common', ${p.kind === "open" ? i + 1 : null}, ${a.exact_only}) RETURNING id`;
          ids[a.canonical] = answer.id;
          for (const key of new Set([a.canonical, ...a.aliases].map(normalize))) {
            await tx`
              INSERT INTO answer_keys (prompt_id, normalized, answer_id, exact_only)
              VALUES (${prompt.id}, ${key}, ${answer.id}, ${a.exact_only})`;
          }
        }
        seeded.set(p.text, { promptId: prompt.id, ids });
      }
      await fn(tx, seeded);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

function prompt(seeded: Seeded, text: string) {
  const p = seeded.get(text);
  if (!p) throw new Error(`Seed fixture has no Prompt "${text}"`);
  return p;
}

function expectMatch(result: MatchResult, answerId: string, method: "exact" | "typo", distance: number) {
  expect(result).toEqual({ matched: true, answerId, method, distance });
}

describe.skipIf(!process.env.DATABASE_URL)("matchGuess on F02's seeded Prompts", () => {
  afterAll(() => sql.end());

  it("Name a graph algorithm: answer-matching.md worked examples", () =>
    withSeed(async (tx, seeded) => {
      const { promptId: p, ids } = prompt(seeded, "Name a graph algorithm");
      expectMatch(await matchGuess(p, "Dijkstra's", tx), ids["Dijkstra"], "exact", 0);
      expectMatch(await matchGuess(p, "bellman fod", tx), ids["Bellman-Ford"], "typo", 1);
      expectMatch(await matchGuess(p, "breadth first search", tx), ids["BFS"], "exact", 0);
      expectMatch(await matchGuess(p, "dfs", tx), ids["DFS"], "exact", 0);
      expect(await matchGuess(p, "shortest path algorithm", tx)).toEqual({ matched: false, method: "none" });
      expect(await matchGuess(p, "A*", tx)).toEqual({ matched: false, method: "none" }); // not in the slides
    }));

  it("BFS and DFS can't fuzzy-match each other on any seeded Prompt (length-3 budget is 0)", () =>
    withSeed(async (tx, seeded) => {
      const withBfs = [...seeded.entries()].filter(([, s]) => s.ids["BFS"]);
      expect(withBfs.length).toBe(3);
      for (const [, { promptId: p, ids }] of withBfs) {
        expectMatch(await matchGuess(p, "BFS", tx), ids["BFS"], "exact", 0);
        expect(await matchGuess(p, "cfs", tx)).toEqual({ matched: false, method: "none" });
        if (ids["DFS"]) {
          expectMatch(await matchGuess(p, "DFS", tx), ids["DFS"], "exact", 0);
          expect(await matchGuess(p, "bds", tx)).toEqual({ matched: false, method: "none" });
        } else {
          expect(await matchGuess(p, "DFS", tx)).toEqual({ matched: false, method: "none" });
        }
      }
    }));

  it("matches Aliases, diacritics and typos on the other seeded Answers", () =>
    withSeed(async (tx, seeded) => {
      const graph = prompt(seeded, "Name a graph algorithm");
      expectMatch(await matchGuess(graph.promptId, "toposort", tx), graph.ids["Topological sort"], "exact", 0);
      expectMatch(await matchGuess(graph.promptId, "Floyd", tx), graph.ids["Floyd-Warshall"], "exact", 0);
      expectMatch(await matchGuess(graph.promptId, "kruskel", tx), graph.ids["Kruskal"], "typo", 1);

      const mst = prompt(seeded, "Name a minimum spanning tree algorithm");
      expectMatch(await matchGuess(mst.promptId, "boruvka", tx), mst.ids["Borůvka"], "exact", 0);
      expect(await matchGuess(mst.promptId, "Dijkstra", tx)).toEqual({ matched: false, method: "none" }); // other Prompt's Answer
    }));

  // Current spec: exact_only is per Answer, so BFS's long Aliases get no typo tolerance either.
  // Open question on issue #19; update this test if exact_only becomes per key.
  it("exact_only on BFS also turns off typos on its long Aliases", () =>
    withSeed(async (tx, seeded) => {
      const { promptId: p } = prompt(seeded, "Name a graph algorithm");
      expect(await matchGuess(p, "bredth first search", tx)).toEqual({ matched: false, method: "none" });
    }));
});
