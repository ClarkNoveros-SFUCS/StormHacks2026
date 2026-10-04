# #2 F02 Seed data: demo Module and Game

Status: done
Branch: feat/2-seed-data
Updated: 2026-10-03 20:40

## Goal
`npm run db:seed -- <clerkUserId>` gives a Player a "Graph Algorithms" Module holding one parsed Source Document and one ready Game, so gameplay and UI work runs without the upload and AI pipelines. Spec: `docs/architecture/data-model.md`; the fixture follows the Gemini response shape in `docs/architecture/game-generation-pipeline.md`.

## Done so far
- Agreed the data shape with Anton. It started from the original sample JSON, and every field maps to a column in the init migration. Dropped from the sample: block ids, prior/crowd rarity, quantiles, daily_set, submissions, rejected_queue, reveal_payload and user_cards.
- `db/seed/graph-algorithms.json`: a 12-slide PPTX (one page per slide) and 12 Prompts: 3 open, 3 cloze, 2 definition_to_term, 2 ordered_recall, 2 odd_one_out. 30 Answers and 80 answer_keys ("Name a graph algorithm" has 13 Answers: 3 common, 5 solid, 4 deep, 1 rare).
- `lib/scoring/tiers.ts`: `TIERS`, `Tier`, `TIER_POINTS`, `assignOpenTiers(n)`. Checked against the spec's examples (N=4 gives 1/1/1/1; N=11 gives 3 common, 4 solid, 3 deep, 1 rare).
- `lib/matching/normalize.ts`: a stopgap copy of the spec's normalize (F05 owns this file, see below)
- `scripts/seed.mts` plus `npm run db:seed`:
  - `--check` validates the fixture without a database, using the same checks a generated Game must pass. A deliberately broken fixture was tested and every error was caught.
  - The seed itself runs in one transaction.
- Verified on `stormhacks-dev` with Anton's id (`user_3KD852awCV88LswW9l5jkVyo4gB`):
  - ran twice, with the same counts both times
  - a decoy Module also named "Graph Algorithms" survived the re-seed
  - a fake guess_event on the old demo Game was deleted
  - `items`/`options` are stored as jsonb arrays
  - the answer-matching.md worked examples behave as documented (exact: dijkstra, breadth first search, dfs; no match: a, shortest path algorithm; typo: "bellman fod" → Bellman-Ford)
  - Personal Best is 0 and Mastery is 0 of 28 (30 after the review fixes)
- typecheck and lint pass. The demo data is currently seeded on stormhacks-dev for Anton.
- An independent review agent returned "pass with fixes". It also ran the real script against a throwaway local Postgres with fake Runs and other Players' data, and a re-seed removed only the demo data. Fixes applied and re-verified on stormhacks-dev:
  - `engines: node >=22.18` in package.json, plus a note in docs/setup/README.md. Node 20 and 22.12 fail with `ERR_UNKNOWN_FILE_EXTENSION` on `.mts`.
  - Added Borůvka and Reverse-delete (both on slide 8) to "Name a graph algorithm". Added Aliases "Floyd", "breadth first", "depth first", "topological order" and "FIFO".
  - `checkFixture` now requires `correct_option` to match an option exactly, and checks each Answer's field types.
  - The queue hint no longer spells out "FIFO".
  - The seed takes a per-Player `pg_advisory_xact_lock(727002, hashtext(playerId))`, so two runs at once queue up instead of failing.
  - `assignOpenTiers` rejects n > 15.

## Next steps
None. Anton approved, and the PR closes #2. F05 merged first; `origin/main` was merged into this branch, keeping F05's `normalize.ts` and both sets of package.json scripts. Afterwards `--check`, typecheck, lint, `npm test` (24) and `npm run test:db` (7) passed, and the demo data was re-seeded with F05's `normalize`.
Follow-up for F05's open checkbox: a `matchGuess` integration test against the seeded "Name a graph algorithm" Prompt.

## Decisions & gotchas
- **Idempotency:** the demo Module id is `md5('seed:graph-algorithms:' || playerId)` formatted as a uuid. A re-seed deletes that Module (which cascades to everything under it) and that Module's Games' guess_events. Nothing else is touched, not even a real Module with the same name. Game, Prompt and Answer ids are new on every run, so old guesses can't count toward the new Game's Mastery.
- **Open Prompt Answers are listed most obvious first.** Their Tiers and `rarity_rank` come from `assignOpenTiers` and are never written in the fixture.
- **ordered_recall and odd_one_out** get one Answer each: `'correct order'` or the correct option. `evidence_page_id` is set on both the Prompt and that Answer, and `evidence_quote` is null. They have no answer_keys, because those kinds aren't typed.
- **`stage_path` is NULL** on the seeded document because it never went to Snowflake. F03's delete and retry routes must handle that.
- **jsonb with postgres.js:** pass arrays as `tx.json(arr)`. A pre-stringified value with `::jsonb` gets JSON-encoded again and stored as a jsonb *string*.
- **How the script runs:** Node 24's type stripping runs `seed.mts` directly; the script uses `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` because the package has no `"type": "module"`. Importing `.ts` from a script needs `allowImportingTsExtensions` in tsconfig (allowed because `noEmit` is on). `seed.mts` can't import `lib/db.ts` (that's `server-only`), so it opens its own client, like `migrate.mjs`.
- **Re-seeding wipes the whole demo Module**, including any Games or uploads a teammate added inside it (for example while testing F04). Put that in the FEATURES.md notes.
- **F05 merge:** expect add/add conflicts on `lib/matching/normalize.ts` (keep F05's) and in `package.json` scripts (keep both `db:seed` and F05's `test`/`test:db`). The reviewer confirmed the two normalize versions give identical output on all 118 fixture strings.
- **Spec gap to raise with F05:** `exact_only` on BFS and DFS also turns off typo tolerance for their long Aliases ("bredth first search" gets no match).
- **Prompt text must be unique** (generation check 7), so the two odd_one_out Prompts have distinct texts.

## Files touched
- db/seed/graph-algorithms.json
- scripts/seed.mts
- lib/scoring/tiers.ts
- lib/matching/normalize.ts (stopgap; F05 owns it)
- package.json (`db:seed`), tsconfig.json (`allowImportingTsExtensions`)
