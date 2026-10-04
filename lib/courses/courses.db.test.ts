// Integration tests for Courses against Tiger Data. Run with `npm run test:db`. Each test seeds
// a 2-Topic test Course through the real seed path (lib/courses/seed.ts, the Modes' own
// generation checks) inside a rolled-back transaction, then plays its public Games as an
// ordinary Player with a fake clock.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import fixture from "@/db/seed/graph-algorithms.json";
import modesFixture from "@/db/seed/graph-algorithms-modes.json";
import { sql } from "@/lib/db";
import * as engine from "@/lib/runs/run-engine";
import { RunError } from "@/lib/runs/run-engine";
import type { LeapAnswerResponse, LeapOptionId, LeapReveal, LeapRunState } from "@/lib/runs/types";
import { getCourse, getTopic, listCourses, markTopicRead } from "./queries";
import { buildCourseRows, checkCourse, seedCourse, type CourseFile } from "./seed";

type Tx = postgres.TransactionSql;

class Clock {
  t = Date.parse("2026-10-04T12:00:00Z");
  now() { return new Date(this.t); }
  tick(ms: number) { this.t += ms; return this.now(); }
}
class Rollback extends Error {}

const leapPrompts = modesFixture.games.find((g) => g.mode === "leap")!.prompts!;
const pages = fixture.document.pages;

/** A test Course: two Topics on the Graph Algorithms notes, each with a Dive and a Leap Game. */
function courseFile(slug: string, opts: { topics?: number; leapTitle?: string } = {}): CourseFile {
  const topic = (n: number) => ({
    slug: `topic-${n}`, order: n, title: `Topic ${n}`, summary: `Summary ${n}`, minutes: 5,
    reading: { pages },
    resources: [{ title: "Docs", url: "https://docs.python.org/3/tutorial/", source: "Python docs" }],
    games: [
      { mode: "dive", title: `T${n} · Dive`, prompts: fixture.game.prompts },
      { mode: "leap", title: opts.leapTitle ?? `T${n} · Leap`, prompts: leapPrompts },
    ],
  });
  return {
    course: { slug, title: "Test Course", level: "Beginner", summary: "s", description: "d", banner_theme: "reef", sort: 99 },
    topics: Array.from({ length: opts.topics ?? 2 }, (_, i) => topic(i + 1)),
  };
}

type F = { tx: Tx; playerId: string; otherPlayerId: string; slug: string; clock: Clock; games: { topic: number; mode: string; id: string }[] };

async function withCourse(fn: (f: F) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      const playerId = `test_f22_${randomUUID()}`;
      const otherPlayerId = `test_f22_${randomUUID()}`;
      await tx`insert into players (id) values (${playerId}), (${otherPlayerId})`;
      const slug = `test-${randomUUID().slice(0, 8)}`;
      const checked = checkCourse(courseFile(slug));
      expect(checked.errors).toEqual([]);
      await seedCourse(tx, buildCourseRows(checked));
      const games = await tx<{ topic: number; mode: string; id: string }[]>`
        select t.position as topic, tg.mode, tg.game_id as id from topic_games tg
          join course_topics t on t.id = tg.topic_id join courses c on c.id = t.course_id
         where c.slug = ${slug} order by t.position, tg.mode`;
      await fn({ tx, playerId, otherPlayerId, slug, clock: new Clock(), games });
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const gameOf = (f: F, topic: number, mode: string) => f.games.find((g) => g.topic === topic && g.mode === mode)!.id;

async function correctId(f: F, gameId: string, s: LeapRunState): Promise<LeapOptionId> {
  const [a] = await f.tx<{ canonical: string }[]>`
    select a.canonical from answers a join prompts p on p.id = a.prompt_id where p.game_id = ${gameId} and p.text = ${s.question!.text}`;
  return s.question!.options.find((o) => o.text === a.canonical)!.id;
}

/** Plays a Leap Run to the end: `right` correct answers first, then wrong ones (or until it falls). */
async function playLeap(f: F, gameId: string, right = 10, playerId = f.playerId): Promise<string> {
  const { runId } = await engine.createRun(f.tx, playerId, gameId, f.clock.now());
  let s = (await engine.getRunState(f.tx, playerId, runId, f.clock.now())) as LeapRunState;
  for (let i = 0; s.status === "in_progress"; i++) {
    s = (await engine.startPrompt(f.tx, playerId, runId, f.clock.tick(100))) as LeapRunState;
    const ok = await correctId(f, gameId, s);
    const optionId = i < right ? ok : s.question!.options.find((o) => o.id !== ok)!.id;
    s = ((await engine.answer(f.tx, playerId, runId, { optionId }, f.clock.tick(1000))) as LeapAnswerResponse).state;
  }
  return runId;
}

const reveal = (f: F, runId: string, playerId = f.playerId) => engine.getReveal(f.tx, playerId, runId) as Promise<LeapReveal>;

async function xp(f: F, reason: string, playerId = f.playerId) {
  return f.tx<{ amount: number; ref: string }[]>`
    select amount, ref from xp_events where player_id = ${playerId} and reason = ${reason} order by at`;
}

async function rejects(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e) => e instanceof RunError && e.status === status);
}

describe.skipIf(!process.env.DATABASE_URL)("Courses", () => {
  afterAll(() => sql.end());

  it("lets any Player run a public Game they don't own; progress stays theirs", () =>
    withCourse(async (f) => {
      const game = gameOf(f, 1, "leap");
      const [g] = await f.tx`select player_id, visibility, status from games where id = ${game}`;
      expect(g).toMatchObject({ player_id: "system", visibility: "public", status: "ready" });

      const runId = await playLeap(f, game, 2); // 2 right, then 3 wrong → fell
      const r = await reveal(f, runId);
      expect(r).toMatchObject({ passed: false, progress: { isNewPersonalBest: true, masteryAfter: expect.any(Number) } });
      expect(r.progress!.masteryAfter).toBeGreaterThan(0); // counted through a public Game
      expect(r.topic).toMatchObject({ courseSlug: f.slug, topicSlug: "topic-1", topicNumber: 1, passed: false, passedNow: false, unlockedNext: false });
      const [{ n }] = await f.tx`select count(*)::int as n from guess_events where run_id = ${runId} and player_id = ${f.playerId}`;
      expect(n).toBe(5);

      // Another Player can't see this Player's Run; the system Player's private Games stay private
      await rejects(engine.getReveal(f.tx, f.otherPlayerId, runId), 404);
      await f.tx`update games set visibility = 'private' where id = ${game}`;
      await rejects(engine.createRun(f.tx, f.playerId, game, f.clock.now()), 404);
    }));

  it("awards XP for every finished Run, once", () =>
    withCourse(async (f) => {
      const runId = await playLeap(f, gameOf(f, 1, "leap"), 2);
      const runXp = await xp(f, "run_finished");
      expect(runXp).toEqual([{ amount: expect.any(Number), ref: runId }]);
      // Reading the Run again (state, Reveal) finishes nothing twice
      await engine.getRunState(f.tx, f.playerId, runId, f.clock.tick(60_000));
      await reveal(f, runId);
      expect(await xp(f, "run_finished")).toHaveLength(1);
    }));

  it("locks Topic 2 until Topic 1 is passed (403), then unlocks it", () =>
    withCourse(async (f) => {
      await rejects(engine.createRun(f.tx, f.playerId, gameOf(f, 2, "leap"), f.clock.now()), 403);
      let topic2 = (await getTopic(f.slug, "topic-2", f.playerId, f.tx))!;
      expect(topic2.progress).toMatchObject({ locked: true, passed: false });

      const runId = await playLeap(f, gameOf(f, 1, "leap"));
      const r = await reveal(f, runId);
      expect(r.passed).toBe(true);
      expect(r.topic).toMatchObject({ passed: true, passedNow: true, passedBefore: false, nextTopicSlug: "topic-2", unlockedNext: true, courseFinished: false });

      topic2 = (await getTopic(f.slug, "topic-2", f.playerId, f.tx))!;
      expect(topic2.progress).toMatchObject({ locked: false, passed: false });
      const { runId: run2 } = await engine.createRun(f.tx, f.playerId, gameOf(f, 2, "leap"), f.clock.now());
      expect(run2).toBeTruthy();
      // Unlocks are per Player
      await rejects(engine.createRun(f.tx, f.otherPlayerId, gameOf(f, 2, "leap"), f.clock.now()), 403);
    }));

  it("awards a Topic pass once (+150 XP, Topic Badge) and the Course after the last Topic", () =>
    withCourse(async (f) => {
      const first = await playLeap(f, gameOf(f, 1, "leap"));
      const again = await playLeap(f, gameOf(f, 1, "leap"));
      expect((await reveal(f, again)).topic).toMatchObject({ passed: true, passedNow: false, passedBefore: true, unlockedNext: false });
      expect(await xp(f, "topic_passed")).toEqual([{ amount: 150, ref: `${f.slug}:1` }]);
      const [progress] = await f.tx`
        select tp.passed_run_id, tp.passed_mode, tp.modes from topic_progress tp join course_topics t on t.id = tp.topic_id
          join courses c on c.id = t.course_id where c.slug = ${f.slug} and t.position = 1 and tp.player_id = ${f.playerId}`;
      expect(progress).toMatchObject({ passed_run_id: first, passed_mode: "leap", modes: { leap: { passed: true, runs: 2, best: expect.any(Number) } } });
      expect(await xp(f, "course_finished")).toEqual([]);

      const last = await playLeap(f, gameOf(f, 2, "leap"));
      expect((await reveal(f, last)).topic).toMatchObject({ passedNow: true, nextTopicSlug: null, unlockedNext: false, courseFinished: true });
      expect(await xp(f, "course_finished")).toEqual([{ amount: 500, ref: f.slug }]);
      const badges = await f.tx<{ badge_id: string }[]>`select badge_id from player_badges where player_id = ${f.playerId} order by badge_id`;
      expect(badges.map((b) => b.badge_id)).toEqual(expect.arrayContaining([`course-${f.slug}`, `topic-${f.slug}-1`, `topic-${f.slug}-2`, "first-dive"]));

      const course = (await getCourse(f.slug, f.playerId, f.tx))!;
      expect(course.progress).toEqual({ passed: 2, total: 2, finished: true, nextTopicSlug: null });
    }));

  it("serves the catalogue and readings signed out, with no progress", () =>
    withCourse(async (f) => {
      const listed = (await listCourses(null, f.tx)).find((c) => c.slug === f.slug)!;
      expect(listed).toMatchObject({ title: "Test Course", topicCount: 2, minutes: 10, modes: ["dive", "leap"], progress: null, badgeId: `course-${f.slug}` });
      const course = (await getCourse(f.slug, null, f.tx))!;
      expect(course.topics.map((t) => [t.number, t.slug, t.progress])).toEqual([[1, "topic-1", null], [2, "topic-2", null]]);

      const topic = (await getTopic(f.slug, "topic-1", null, f.tx))!;
      expect(topic.reading.pages).toHaveLength(pages.length);
      expect(topic.reading.pages[0]).toEqual({ pageNumber: 1, contentMd: pages[0].content_md });
      expect(topic.games.map((g) => [g.mode, g.passBar, g.me])).toEqual([
        ["dive", "Score 150 or more", null], ["leap", "Get 7 of 10 right without falling", null],
      ]);
      expect(topic).toMatchObject({ prev: null, next: { slug: "topic-2" }, progress: null, resources: [{ title: "Docs", source: "Python docs" }] });
      expect(await getTopic(f.slug, "nope", null, f.tx)).toBeNull();
      expect(await getCourse("no-such-course", null, f.tx)).toBeNull();

      // Signed in: the caller's record per Mode
      await playLeap(f, gameOf(f, 1, "leap"), 2);
      const mine = (await getTopic(f.slug, "topic-1", f.playerId, f.tx))!;
      expect(mine.games.find((g) => g.mode === "leap")!.me).toMatchObject({ passed: false, runs: 1 });
      expect(mine.games.find((g) => g.mode === "dive")!.me).toEqual({ best: null, passed: false, runs: 0 });
    }));

  it("marks a reading as read once (+20 XP), even on a locked Topic", () =>
    withCourse(async (f) => {
      const a = await markTopicRead(f.playerId, f.slug, "topic-2", f.tx);
      expect(a.progress).toMatchObject({ read: true, locked: true, passed: false });
      expect(a.xp.xpAwarded).toBe(20);
      const b = await markTopicRead(f.playerId, f.slug, "topic-2", f.tx);
      expect(b.xp.xpAwarded).toBe(0);
      expect(b.progress.readAt).toBe(a.progress.readAt);
      expect(await xp(f, "topic_read")).toEqual([{ amount: 20, ref: `${f.slug}:2` }]);
      await expect(markTopicRead(f.playerId, f.slug, "nope", f.tx)).rejects.toMatchObject({ status: 404 });
    }));

  it("re-seeding is idempotent and changed content retires the old Game without losing Runs", () =>
    withCourse(async (f) => {
      const count = async () => {
        const [c] = await f.tx`
          select (select count(*)::int from games where player_id = 'system') as games,
                 (select count(*)::int from source_documents where player_id = 'system') as docs,
                 (select count(*)::int from prompts p join games g on g.id = p.game_id where g.player_id = 'system') as prompts,
                 (select count(*)::int from course_topics) as topics`;
        return c;
      };
      const before = await count();
      const runId = await playLeap(f, gameOf(f, 1, "leap"));

      const again = await seedCourse(f.tx, buildCourseRows(checkCourse(courseFile(f.slug))));
      expect(again).toMatchObject({ gamesCreated: 0, gamesKept: 4, gamesRetired: 0, documentsCreated: 0, topicsRemoved: 0 });
      expect(await count()).toEqual(before);

      // A new Leap title is new content: a new Game per Topic, the old ones retired (private) but kept
      const changed = await seedCourse(f.tx, buildCourseRows(checkCourse(courseFile(f.slug, { leapTitle: "Leap v2" }))));
      expect(changed).toMatchObject({ gamesCreated: 2, gamesKept: 2, gamesRetired: 2 });
      const [old] = await f.tx`select visibility from games where id = ${gameOf(f, 1, "leap")}`;
      expect(old.visibility).toBe("private");
      const [run] = await f.tx`select status from runs where id = ${runId}`;
      expect(run.status).toBe("finished");
      const topic = (await getTopic(f.slug, "topic-1", f.playerId, f.tx))!;
      expect(topic.games.find((g) => g.mode === "leap")!.title).toBe("Leap v2");
      expect(topic.progress!.passed).toBe(true); // the Pass is on the Topic, not the Game

      // Dropping a Topic removes it
      const fewer = await seedCourse(f.tx, buildCourseRows(checkCourse(courseFile(f.slug, { topics: 1, leapTitle: "Leap v2" }))));
      expect(fewer).toMatchObject({ topicsRemoved: 1, gamesRetired: 2 });
      expect((await getCourse(f.slug, null, f.tx))!.topicCount).toBe(1);
    }));
});
