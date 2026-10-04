import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Integration test against a real Postgres + TimescaleDB with the migrations applied:
//   docker run -d --name stormhacks-test-db -e POSTGRES_PASSWORD=test -e POSTGRES_DB=stormhacks_test \
//     -p 5499:5432 timescale/timescaledb:latest-pg17
//   DATABASE_URL=postgres://postgres:test@localhost:5499/stormhacks_test npm run db:migrate
//   TEST_DATABASE_URL=postgres://postgres:test@localhost:5499/stormhacks_test npm test
// Fixtures use fresh Player ids and are deleted afterwards.

const enabled = Boolean(process.env.TEST_DATABASE_URL);

describe.skipIf(!enabled)("progress", async () => {
  const { sql } = await import("./db");
  const progress = await import("./progress");

  const me = `test_progress_${randomUUID()}`;
  const other = `test_progress_${randomUUID()}`;
  const t0 = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const at = (min: number) => new Date(t0.getTime() + min * 60 * 1000);

  const id = () => randomUUID();
  const game = id(), emptyGame = id(), othersGame = id();
  const a = { common: id(), solid: id(), deep: id(), rare: id(), cloze: id() };
  const openPrompt = id(), clozePrompt = id();
  const run = { first: id(), abandoned: id(), tie: id(), best: id(), live: id(), zero: id() };

  beforeAll(async () => {
    await sql`insert into players (id) values (${me}), (${other})`;
    const [{ id: module }] = await sql`insert into modules (player_id, name) values (${me}, 'Graphs') returning id`;
    const [{ id: doc }] = await sql`
      insert into source_documents (module_id, player_id, filename, mime_type, size_bytes, status)
      values (${module}, ${me}, 'week9.pdf', 'application/pdf', 1, 'parsed') returning id`;
    await sql`
      insert into games (id, module_id, player_id, title, status) values
        (${game}, ${module}, ${me}, 'Graph algorithms', 'ready'),
        (${emptyGame}, ${module}, ${me}, 'Unplayed', 'ready')`;

    await sql`
      insert into prompts (id, game_id, source_document_id, kind, text, tier) values
        (${openPrompt}, ${game}, ${doc}, 'open', 'Name a graph algorithm', null),
        (${clozePrompt}, ${game}, ${doc}, 'cloze', 'Dijkstra fails with ___ edges', 'deep')`;
    await sql`
      insert into answers (id, prompt_id, canonical, tier, rarity_rank) values
        (${a.common}, ${openPrompt}, 'BFS', 'common', 1),
        (${a.solid}, ${openPrompt}, 'Prim', 'solid', 2),
        (${a.deep}, ${openPrompt}, 'Tarjan', 'deep', 3),
        (${a.rare}, ${openPrompt}, 'Edmonds', 'rare', 4),
        (${a.cloze}, ${clozePrompt}, 'negative', 'deep', null)`;
    const [{ id: emptyPrompt }] = await sql`
      insert into prompts (game_id, source_document_id, kind, text, tier)
      values (${emptyGame}, ${doc}, 'cloze', 'A ___ has no cycles', 'common') returning id`;
    await sql`insert into answers (prompt_id, canonical, tier) values (${emptyPrompt}, 'tree', 'common')`;

    const [{ id: othersModule }] = await sql`insert into modules (player_id, name) values (${other}, 'Other') returning id`;
    await sql`insert into games (id, module_id, player_id, title, status) values (${othersGame}, ${othersModule}, ${other}, 'Theirs', 'ready')`;

    await sql`
      insert into runs (id, player_id, game_id, status, score, started_at, finished_at) values
        (${run.first},     ${me}, ${game},      'finished',    40,  ${at(0)},  ${at(5)}),
        (${run.abandoned}, ${me}, ${game},      'abandoned',   999, ${at(10)}, null),
        (${run.tie},       ${me}, ${game},      'finished',    40,  ${at(20)}, ${at(25)}),
        (${run.best},      ${me}, ${game},      'finished',    100, ${at(30)}, ${at(35)}),
        (${run.live},      ${me}, ${game},      'in_progress', 10,  ${at(40)}, null),
        (${run.zero},      ${me}, ${emptyGame}, 'finished',    0,   ${at(50)}, ${at(55)})`;

    const guess = (
      min: number,
      runId: string,
      answerId: string | null,
      isCorrect: boolean,
      player = me,
      promptId = openPrompt,
    ) => ({
      created_at: at(min),
      player_id: player,
      game_id: game,
      run_id: runId,
      prompt_id: promptId,
      position: 1,
      raw_text: "x",
      matched_answer_id: answerId,
      match_method: isCorrect ? "exact" : "none",
      is_correct: isCorrect,
      ms_into_prompt: 1000,
    });
    await sql`insert into guess_events ${sql([
      guess(1, run.first, a.common, true),
      guess(2, run.first, null, false), // wrong guess
      guess(11, run.abandoned, a.deep, true), // abandoned Runs still count toward Mastery
      guess(21, run.tie, a.common, true), // same Answer again counts once
      guess(31, run.best, a.cloze, true, me, clozePrompt),
      guess(32, run.best, a.solid, true),
      guess(33, run.best, randomUUID(), true), // orphan: Answer no longer exists
      guess(33, run.best, a.rare, true, other), // another Player's guess
    ])}`;
  });

  afterAll(async () => {
    await sql`delete from guess_events where player_id in (${me}, ${other})`;
    await sql`delete from players where id in (${me}, ${other})`; // cascades
    await sql.end();
  });

  it("personalBest ignores abandoned and in-progress Runs", async () => {
    expect(await progress.personalBest(me, game)).toBe(100);
    expect(await progress.personalBest(me, emptyGame)).toBe(0);
    expect(await progress.personalBest(other, game)).toBe(0);
  });

  it("mastery counts distinct found Answers, ignoring wrong, orphan and other Players' guesses", async () => {
    expect(await progress.mastery(me, game)).toEqual({ found: 4, total: 5, pct: 80 });
    expect(await progress.mastery(me, emptyGame)).toEqual({ found: 0, total: 1, pct: 0 });
  });

  it("mastery is 0 of 0 for a Game the Player doesn't own, even with guesses on it", async () => {
    expect(await progress.mastery(other, game)).toEqual({ found: 0, total: 0, pct: 0 });
  });

  it("masteryByTier fills every Tier", async () => {
    expect(await progress.masteryByTier(me, game)).toEqual({
      common: { found: 1, total: 1 },
      solid: { found: 1, total: 1 },
      deep: { found: 2, total: 2 },
      rare: { found: 0, total: 1 },
    });
    expect(await progress.masteryByTier(other, game)).toEqual({
      common: { found: 0, total: 0 },
      solid: { found: 0, total: 0 },
      deep: { found: 0, total: 0 },
      rare: { found: 0, total: 0 },
    });
  });

  it("recentRuns lists finished Runs, newest first", async () => {
    const runs = await progress.recentRuns(me, game);
    expect(runs.map((r) => r.runId)).toEqual([run.best, run.tie, run.first]);
    expect(runs[0]).toEqual({ runId: run.best, score: 100, finishedAt: at(35) });
    expect((await progress.recentRuns(me, game, 2)).map((r) => r.runId)).toEqual([run.best, run.tie]);
  });

  it("progressForGames returns only the Player's Games", async () => {
    const byGame = await progress.progressForGames(me, [game, emptyGame, othersGame]);
    expect([...byGame.keys()].sort()).toEqual([game, emptyGame].sort());
    expect(byGame.get(game)).toEqual({ personalBest: 100, mastery: { found: 4, total: 5, pct: 80 } });
    expect(byGame.get(emptyGame)).toEqual({ personalBest: 0, mastery: { found: 0, total: 1, pct: 0 } });
    expect((await progress.progressForGames(me, [])).size).toBe(0);
  });

  it("runProgress: the first finished Run is a new best", async () => {
    expect(await progress.runProgress(me, run.first)).toEqual({
      score: 40,
      previousBest: null,
      isNewBest: true,
      masteryBefore: { found: 0, total: 5, pct: 0 },
      masteryAfter: { found: 1, total: 5, pct: 20 },
    });
  });

  it("runProgress: a tie isn't a new best; the abandoned Run's find counts as before", async () => {
    expect(await progress.runProgress(me, run.tie)).toEqual({
      score: 40,
      previousBest: 40,
      isNewBest: false,
      masteryBefore: { found: 2, total: 5, pct: 40 },
      masteryAfter: { found: 2, total: 5, pct: 40 },
    });
  });

  it("runProgress: a higher score is a new best, and Mastery grows", async () => {
    expect(await progress.runProgress(me, run.best)).toEqual({
      score: 100,
      previousBest: 40,
      isNewBest: true,
      masteryBefore: { found: 2, total: 5, pct: 40 },
      masteryAfter: { found: 4, total: 5, pct: 80 },
    });
  });

  it("runProgress: a first Run scoring 0 isn't a new best", async () => {
    const p = await progress.runProgress(me, run.zero);
    expect(p).toMatchObject({ score: 0, previousBest: null, isNewBest: false });
  });

  it("runProgress is null for unfinished Runs and other Players", async () => {
    expect(await progress.runProgress(me, run.abandoned)).toBeNull();
    expect(await progress.runProgress(me, run.live)).toBeNull();
    expect(await progress.runProgress(other, run.best)).toBeNull();
  });
});
