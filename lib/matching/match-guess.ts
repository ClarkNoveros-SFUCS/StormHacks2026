import "server-only";
import type postgres from "postgres";
import { sql } from "@/lib/db";
import { normalize } from "./normalize";

// Spec: docs/architecture/answer-matching.md
export type MatchResult =
  | { matched: true; answerId: string; method: "exact" | "typo"; distance: number }
  | { matched: false; method: "none" | "ambiguous" };

// The shared client or a transaction from `sql.begin()`
export type Db = postgres.Sql | postgres.TransactionSql;

// fuzzystrmatch's levenshtein functions reject strings longer than this.
const MAX_FUZZY_LENGTH = 255;

export function typoBudget(length: number): number {
  if (length < 5) return 0;
  if (length <= 8) return 1;
  return 2;
}

// Is a typed guess one of this Prompt's Answers? Pass `db` to run inside the
// caller's transaction (the Run engine does); it defaults to the shared client.
export async function matchGuess(
  promptId: string,
  raw: string,
  db: Db = sql,
): Promise<MatchResult> {
  const guess = normalize(raw);
  if (guess === "") return { matched: false, method: "none" };

  // Step 1: exact, including exact_only keys
  const [exact] = await db<{ answer_id: string }[]>`
    SELECT answer_id FROM answer_keys
     WHERE prompt_id = ${promptId} AND normalized = ${guess}
  `;
  if (exact) return { matched: true, answerId: exact.answer_id, method: "exact", distance: 0 };

  // Step 2: typo, within a length-based budget, never on exact_only keys
  const budget = typoBudget(guess.length);
  if (budget === 0 || guess.length > MAX_FUZZY_LENGTH) return { matched: false, method: "none" };

  // The CASE keeps an over-long stored key from erroring, whatever order Postgres evaluates the filters in.
  const hits = await db<{ answer_id: string; distance: number }[]>`
    SELECT answer_id, min(d)::int AS distance
      FROM (
        SELECT answer_id,
               CASE WHEN length(normalized) <= ${MAX_FUZZY_LENGTH}::int
                    THEN levenshtein_less_equal(normalized, ${guess}::text, ${budget}::int)
               END AS d
          FROM answer_keys
         WHERE prompt_id = ${promptId}
           AND NOT exact_only
           AND abs(length(normalized) - ${guess.length}::int) <= ${budget}::int
      ) k
     WHERE d <= ${budget}::int
     GROUP BY answer_id
     LIMIT 2
  `;
  if (hits.length === 1) {
    return { matched: true, answerId: hits[0].answer_id, method: "typo", distance: hits[0].distance };
  }
  // ≥ 2 Answers in reach: crediting the wrong one is worse than a few lost seconds
  return { matched: false, method: hits.length === 0 ? "none" : "ambiguous" };
}
