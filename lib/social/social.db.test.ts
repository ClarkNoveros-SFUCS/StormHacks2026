// Integration tests for lib/social against Tiger Data. Run with `npm run test:db`.
// Most tests build their fixture inside a transaction that is rolled back (like F05's). The
// heatmap test can't: the continuous aggregate only shows past days after a refresh, which
// can't run inside a transaction. It commits under fresh Player ids and deletes in afterAll.
import { randomUUID } from "node:crypto";
import type postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { sql } from "@/lib/db";
import { heatmap, heatmapRange } from "./activity";
import { addDays, vancouverDay } from "./days";
import { SocialError } from "./errors";
import {
  acceptFriendRequest, declineFriendRequest, friendStatuses, listFriends, removeFriend, searchPlayers, sendFriendRequest,
} from "./friends";
import { courseLeaderboard, gameLeaderboard, weeklyXp } from "./leaderboards";
import { ensureProfile, myProfile, profileCard, profileFor, SYSTEM_PLAYER_ID, updateProfile } from "./profile";
import { awardXp, onDailyPlayed, onRunFinished, onTopicPassed, streakFor, totalXp } from "./xp";

type Tx = postgres.TransactionSql;
class Rollback extends Error {}

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }
}

const tag = randomUUID().slice(0, 6).replace(/-/g, "");

/** Creates Players with distinct usernames like `t<tag>_alice`. Returns ids by name. */
async function players<N extends string>(tx: Tx, ...names: N[]): Promise<Record<N, string>> {
  const out = {} as Record<N, string>;
  for (const n of names) {
    const id = `test_f21_${n}_${randomUUID()}`;
    await tx`insert into players (id) values (${id})`;
    await ensureProfile(id, { username: `t${tag}_${n}`, fullName: `Test ${n}` }, tx);
    out[n] = id;
  }
  return out;
}

const uname = (n: string) => `t${tag}_${n}`;

async function expectSocialError(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e) => e instanceof SocialError && e.status === status);
}

/** A ready Game owned by the system Player (public until F22 adds games.visibility). */
async function publicGame(tx: Tx): Promise<string> {
  await tx`insert into players (id) values (${SYSTEM_PLAYER_ID}) on conflict (id) do nothing`;
  const [mod] = await tx`insert into modules (player_id, name) values (${SYSTEM_PLAYER_ID}, 'F21 test') returning id`;
  const [game] = await tx`
    insert into games (module_id, player_id, title, status) values (${mod.id}, ${SYSTEM_PLAYER_ID}, 'F21 public', 'ready') returning id`;
  return game.id;
}

async function privateGame(tx: Tx, owner: string): Promise<string> {
  const [mod] = await tx`insert into modules (player_id, name) values (${owner}, 'Mine') returning id`;
  const [game] = await tx`insert into games (module_id, player_id, title, status) values (${mod.id}, ${owner}, 'Mine', 'ready') returning id`;
  return game.id;
}

async function finishedRun(tx: Tx, player: string, game: string, score: number, finishedAt: Date): Promise<string> {
  const [run] = await tx`
    insert into runs (player_id, game_id, status, score, started_at, finished_at)
    values (${player}, ${game}, 'finished', ${score}, ${new Date(finishedAt.getTime() - 60_000)}, ${finishedAt}) returning id`;
  return run.id;
}

describe.skipIf(!process.env.DATABASE_URL)("social", () => {
  afterAll(() => sql.end());

  describe("profiles", () => {
    it("derives a username from Clerk data and de-duplicates it", () =>
      rolledBack(async (tx) => {
        const a = `test_f21_${randomUUID()}`, b = `test_f21_${randomUUID()}`;
        await tx`insert into players (id) values (${a}), (${b})`;
        const source = { fullName: `Dup ${tag}`, imageUrl: "https://img.example/a.png" };
        expect(await ensureProfile(a, source, tx)).toBe(`dup_${tag}`);
        expect(await ensureProfile(b, source, tx)).toBe(`dup_${tag}2`);
        expect(await ensureProfile(a, null, tx)).toBe(`dup_${tag}`); // stable once set
        const [row] = await tx`select display_name, image_url, avatar, use_photo from players where id = ${a}`;
        expect(row).toEqual({ display_name: `Dup ${tag}`, image_url: "https://img.example/a.png", avatar: "anglerfish", use_photo: false });
      }));

    it("edits the profile and refuses a taken username", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "ed", "taken");
        const me = await updateProfile(p.ed, { username: `T${tag}_New`, displayName: "Eddie", avatar: "octopus", usePhoto: true, bio: "hi" }, tx);
        expect(me.player).toMatchObject({ username: `t${tag}_new`, displayName: "Eddie", avatar: "octopus" });
        expect(me.bio).toBe("hi");
        expect(me.usePhoto).toBe(true);
        await expectSocialError(updateProfile(p.ed, { username: uname("taken") }, tx), 409);
        await expectSocialError(updateProfile(p.ed, { username: "no" }, tx), 400);
        await expectSocialError(updateProfile(p.ed, { avatar: "dragon" }, tx), 400);
        await expectSocialError(updateProfile(p.ed, { email: "x" }, tx), 400); // unknown field
        // bio: null clears it; omitted fields stay
        const cleared = await updateProfile(p.ed, { bio: null }, tx);
        expect(cleared.bio).toBeNull();
        expect(cleared.player.displayName).toBe("Eddie");
      }));

    it("shows a public profile without private fields and with friend status", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "viewer", "owner");
        await privateGame(tx, p.owner);
        const pub = await profileFor(p.viewer, uname("owner").toUpperCase(), tx);
        expect(pub).not.toBeNull();
        expect(pub!.player.username).toBe(uname("owner"));
        expect(pub!.friendStatus).toBe("none");
        expect(pub!.counts.modules).toBe(1);
        expect(pub!.bests).toEqual([]); // private Games never show
        expect(pub).not.toHaveProperty("usePhoto");
        expect(pub).not.toHaveProperty("clerkImageUrl");
        expect(pub!.heatmap.days.length).toBeGreaterThanOrEqual(365);
        expect((await profileFor(p.owner, uname("owner"), tx))!.friendStatus).toBe("self");
        expect(await profileFor(p.viewer, "t_nobody_here", tx)).toBeNull();
      }));
  });

  describe("XP, levels and badges", () => {
    it("onRunFinished awards XP once and evaluates badges", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "runner");
        const game = await privateGame(tx, p.runner);
        const at = new Date(Date.now() - 5 * 60_000);
        const runId = await finishedRun(tx, p.runner, game, 520, at);
        // a rare-tier correct guess in this Run → Trench Diver
        await tx`
          insert into guess_events (created_at, player_id, game_id, run_id, prompt_id, position, raw_text, match_method, is_correct, points, ms_into_prompt, tier)
          values (${new Date(at.getTime() - 30_000)}, ${p.runner}, ${game}, ${runId}, ${randomUUID()}, 1, 'x', 'exact', true, 100, 4000, 'rare')`;

        const first = await onRunFinished(p.runner, { runId, mode: "dive", score: 520, finishedAt: at.toISOString(), outcome: "finished", stats: {} }, tx);
        expect(first.xpAwarded).toBe(104);
        expect(first.totalXp).toBe(104);
        expect(first.levelBefore).toBe(1);
        expect(first.levelAfter).toBe(2);
        expect(first.leveledUp).toBe(true);
        expect(first.newBadges.map((b) => b.id).sort()).toEqual(["first-dive", "trench-diver"]);
        expect(first.streak).toMatchObject({ current: 1, playedToday: vancouverDay(at) === vancouverDay(new Date()) });

        const again = await onRunFinished(p.runner, { runId, mode: "dive", score: 520, finishedAt: at.toISOString(), outcome: "finished", stats: {} }, tx);
        expect(again.xpAwarded).toBe(0);
        expect(again.totalXp).toBe(104);
        expect(again.newBadges).toEqual([]);
        expect(await totalXp(p.runner, tx)).toBe(104);
        expect(await awardXp(p.runner, 999, "run_finished", runId, tx)).toBe(0);

        const card = await profileCard(p.runner, tx);
        expect(card).toMatchObject({ totalXp: 104, badgeCount: 2, level: { level: 2, rank: "Plankton" } });
      }));

    it("Topic passes and the Daily award once, with the Daily streak bonus", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "learner");
        const t1 = await onTopicPassed(p.learner, { course: "python-basics", topicNumber: 1 }, tx);
        expect(t1.xpAwarded).toBe(150);
        expect(t1.newBadges.map((b) => b.id)).toEqual(["topic-python-basics-1"]);
        expect((await onTopicPassed(p.learner, { course: "python-basics", topicNumber: 1 }, tx)).xpAwarded).toBe(0);

        // Two days of finished Runs (yesterday and today) → streak 2 → Daily = 50 + 10
        const game = await privateGame(tx, p.learner);
        const now = new Date();
        for (const at of [new Date(now.getTime() - 24 * 3600_000), new Date(now.getTime() - 60_000)]) {
          const runId = await finishedRun(tx, p.learner, game, 50, at);
          await onRunFinished(p.learner, { runId, mode: "dive", score: 50, finishedAt: at, outcome: "finished" }, tx);
        }
        const daily = await onDailyPlayed(p.learner, vancouverDay(now), tx);
        expect(daily.streak.current).toBe(2);
        expect(daily.xpAwarded).toBe(60);
        expect((await onDailyPlayed(p.learner, vancouverDay(now), tx)).xpAwarded).toBe(0);
      }));

    it("counts the streak in Vancouver days, across midnight", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "streaker");
        // 2026-06-10 23:58 PDT (06:58Z on the 11th) and 2026-06-11 00:02 PDT: four minutes apart, two days
        const at = (iso: string) => awardXp(p.streaker, 5, "run_finished", randomUUID(), tx, new Date(iso));
        await at("2026-06-09T19:00:00Z"); // June 9, noon PDT
        await at("2026-06-11T06:58:00Z"); // June 10, 23:58 PDT
        await at("2026-06-11T07:02:00Z"); // June 11, 00:02 PDT
        // In UTC both late events are June 11, so UTC days would give a different streak
        expect(await streakFor(p.streaker, tx, new Date("2026-06-11T20:00:00Z"))).toEqual({ current: 3, longest: 3, playedToday: true });
        // Next day, unplayed: still lit
        expect(await streakFor(p.streaker, tx, new Date("2026-06-12T20:00:00Z"))).toEqual({ current: 3, longest: 3, playedToday: false });
        // Day after: broken, longest kept
        expect(await streakFor(p.streaker, tx, new Date("2026-06-13T20:00:00Z"))).toEqual({ current: 0, longest: 3, playedToday: false });
        // Seen from June 10 at 23:59 PDT, the 00:02 event is tomorrow
        expect(await streakFor(p.streaker, tx, new Date("2026-06-11T06:59:00Z"))).toEqual({ current: 2, longest: 2, playedToday: true });
      }));
  });

  describe("friends", () => {
    it("request → accept → list → remove, and decline", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "amy", "bob", "cat");
        const req = await sendFriendRequest(p.amy, uname("bob"), tx);
        expect(req.status).toBe("pending");
        expect(await sendFriendRequest(p.amy, uname("bob"), tx)).toEqual(req); // asking twice is a no-op

        let bobs = await listFriends(p.bob, tx);
        expect(bobs.incoming.map((r) => r.player.username)).toEqual([uname("amy")]);
        expect((await listFriends(p.amy, tx)).outgoing.map((r) => r.id)).toEqual([req.requestId]);
        expect((await friendStatuses(p.bob, [p.amy], tx)).get(p.amy)).toEqual({ status: "incoming", requestId: req.requestId });

        await expectSocialError(acceptFriendRequest(p.amy, req.requestId, tx), 404); // only the addressee accepts
        await acceptFriendRequest(p.bob, req.requestId, tx);
        bobs = await listFriends(p.bob, tx);
        expect(bobs.friends.map((f) => f.player.username)).toEqual([uname("amy")]);
        expect(bobs.incoming).toEqual([]);
        await expectSocialError(sendFriendRequest(p.bob, uname("amy"), tx), 409);
        expect((await profileFor(p.amy, uname("bob"), tx))!.friendStatus).toBe("friends");

        // Cat asks Amy; Amy declines
        const catReq = await sendFriendRequest(p.cat, uname("amy"), tx);
        await declineFriendRequest(p.amy, catReq.requestId, tx);
        expect((await listFriends(p.cat, tx)).outgoing).toEqual([]);

        // Crossed requests: Cat asks Bob, then Bob "asks" Cat → accepted
        await sendFriendRequest(p.cat, uname("bob"), tx);
        expect((await sendFriendRequest(p.bob, uname("cat"), tx)).status).toBe("accepted");

        await removeFriend(p.amy, uname("bob"), tx);
        expect((await listFriends(p.amy, tx)).friends).toEqual([]);
        await expectSocialError(removeFriend(p.amy, uname("bob"), tx), 404);
        await expectSocialError(sendFriendRequest(p.amy, uname("amy"), tx), 400);
        await expectSocialError(sendFriendRequest(p.amy, "t_nobody_here", tx), 404);
        await expectSocialError(acceptFriendRequest(p.bob, "not-a-uuid", tx), 404);
      }));

    it("searches by username or display name prefix", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "sam", "sally", "zed");
        await updateProfile(p.zed, { displayName: `Searchy ${tag}` }, tx);
        const hits = await searchPlayers(p.sam, `t${tag}_sa`, 20, tx);
        expect(hits.map((h) => h.player.username)).toEqual([uname("sally")]); // not yourself
        expect((await searchPlayers(p.sam, `SEARCHY ${tag}`, 20, tx)).map((h) => h.player.username)).toEqual([uname("zed")]);
        expect(await searchPlayers(p.sam, "", 20, tx)).toEqual([]);
        expect(await searchPlayers(p.sam, "%", 20, tx)).toEqual([]); // LIKE wildcards are literal
      }));
  });

  describe("leaderboards", () => {
    it("orders a public Game by score, then earlier finish; ties share a place", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "a", "b", "c", "d", "e");
        const game = await publicGame(tx);
        const t = (min: number) => new Date(Date.UTC(2026, 8, 20, 18, min)); // Sep 20, 11:xx PDT
        await finishedRun(tx, p.a, game, 100, t(5));
        await finishedRun(tx, p.a, game, 40, t(1)); //   not counted: lower
        await finishedRun(tx, p.b, game, 100, t(3)); //  same score, earlier → above a
        await finishedRun(tx, p.c, game, 150, t(10));
        await finishedRun(tx, p.d, game, 50, t(2));
        await finishedRun(tx, p.e, game, 50, t(2)); //   exact tie with d

        const board = (await gameLeaderboard(p.d, game, { limit: 2 }, tx))!;
        expect(board.entries.map((e) => [e.place, e.player.username, e.value])).toEqual([
          [1, uname("c"), 150],
          [2, uname("b"), 100],
        ]);
        expect(board.total).toBe(5);
        expect(board.me).toMatchObject({ place: 4, value: 50, isMe: true }); // outside the top 2
        const full = (await gameLeaderboard(p.d, game, {}, tx))!;
        expect(full.entries.map((e) => e.place)).toEqual([1, 2, 3, 4, 4]);

        // Friends scope: me + my friends only
        const req = await sendFriendRequest(p.a, uname("b"), tx);
        await acceptFriendRequest(p.b, req.requestId, tx);
        const friends = (await gameLeaderboard(p.a, game, { scope: "friends" }, tx))!;
        expect(friends.entries.map((e) => [e.place, e.player.username])).toEqual([[1, uname("b")], [2, uname("a")]]);

        // A day filter and "first Run counts" (the Daily's one counted attempt)
        const first = (await gameLeaderboard(p.a, game, { day: "2026-09-20", counting: "first" }, tx))!;
        expect(first.entries.find((e) => e.isMe)?.value).toBe(40);
        expect((await gameLeaderboard(p.a, game, { day: "2026-09-21" }, tx))!.entries).toEqual([]);
        await expectSocialError(gameLeaderboard(p.a, game, { day: "21/09/2026" }, tx), 400);

        // Private Games have no leaderboard
        expect(await gameLeaderboard(p.a, await privateGame(tx, p.a), {}, tx)).toBeNull();
        expect(await gameLeaderboard(p.a, "nope", {}, tx)).toBeNull();
      }));

    it("ranks this week's XP from the continuous aggregate, globally and among friends", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "w1", "w2", "w3");
        await awardXp(p.w1, 120, "topic_passed", "x:1", tx);
        await awardXp(p.w2, 300, "topic_passed", "x:1", tx);
        await awardXp(p.w3, 50, "topic_passed", "x:1", tx);
        await awardXp(p.w3, 30, "topic_passed", "x:2", tx);

        const global = await weeklyXp(p.w3, "global", 100, tx);
        const mine = global.entries.filter((e) => e.player.username?.startsWith(`t${tag}_w`)); // ignore real Players
        expect(mine.map((e) => [e.player.username, e.value])).toEqual([[uname("w2"), 300], [uname("w1"), 120], [uname("w3"), 80]]);
        expect(global.me).toMatchObject({ value: 80, isMe: true });
        expect(global.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(`${global.period}T00:00:00Z`).getUTCDay()).toBe(1); // weeks start Monday

        const alone = await weeklyXp(p.w3, "friends", 50, tx);
        expect(alone.entries.map((e) => e.player.username)).toEqual([uname("w3")]);
      }));

    it("ranks Course Topic passes", () =>
      rolledBack(async (tx) => {
        const p = await players(tx, "c1", "c2");
        await onTopicPassed(p.c1, { course: "python-basics", topicNumber: 1 }, tx);
        await onTopicPassed(p.c2, { course: "python-basics", topicNumber: 1 }, tx);
        await onTopicPassed(p.c2, { course: "python-basics", topicNumber: 2 }, tx);
        const req = await sendFriendRequest(p.c1, uname("c2"), tx);
        await acceptFriendRequest(p.c2, req.requestId, tx);
        const board = await courseLeaderboard(p.c1, { scope: "friends", course: "python-basics" }, tx);
        expect(board.entries.map((e) => [e.place, e.player.username, e.value])).toEqual([[1, uname("c2"), 2], [2, uname("c1"), 1]]);
        expect((await courseLeaderboard(p.c1, { scope: "friends", course: "sql-basics" }, tx)).entries).toEqual([]);
      }));
  });

  describe("heatmap (committed fixture)", () => {
    const me = `test_f21_heat_${randomUUID()}`;
    afterAll(async () => {
      await sql`delete from xp_events where player_id = ${me}`;
      await sql`delete from players where id = ${me}`;
      await sql`call refresh_continuous_aggregate('player_activity_daily', now() - interval '30 days', now() - interval '1 minute')`;
    });

    it("gap-fills 53 weeks of Vancouver days from the continuous aggregate", async () => {
      await sql`insert into players (id) values (${me})`;
      const today = vancouverDay(new Date());
      const d = addDays(today, -10);
      // 23:59 local on day d−1 and 00:01 local on day d: separate cells
      await sql`
        insert into xp_events (at, player_id, amount, reason, ref) values
          ((${d}::date::timestamp at time zone 'America/Vancouver') - interval '1 minute', ${me}, 30, 'run_finished', 'h1'),
          ((${d}::date::timestamp at time zone 'America/Vancouver') + interval '1 minute', ${me}, 80, 'run_finished', 'h2'),
          ((${d}::date::timestamp at time zone 'America/Vancouver') + interval '2 hours', ${me}, 150, 'topic_passed', 'h3'),
          (now() - interval '2 minutes', ${me}, 10, 'run_finished', 'h4')`;
      await sql`call refresh_continuous_aggregate('player_activity_daily', now() - interval '30 days', now() - interval '1 minute')`;

      const grid = await heatmap(me);
      const { from } = heatmapRange(new Date());
      expect(grid.from).toBe(from);
      expect(grid.to).toBe(today);
      expect(new Date(`${grid.from}T00:00:00Z`).getUTCDay()).toBe(0); // Sunday
      expect(grid.days.length).toBeGreaterThanOrEqual(365);
      expect(grid.days.length).toBeLessThanOrEqual(371);
      expect(new Set(grid.days.map((x) => x.day)).size).toBe(grid.days.length);

      const cell = (day: string) => grid.days.find((x) => x.day === day);
      expect(cell(addDays(d, -1))).toEqual({ day: addDays(d, -1), xp: 30, runs: 1, level: 1 });
      expect(cell(d)).toEqual({ day: d, xp: 230, runs: 1, level: 4 });
      expect(cell(today)).toMatchObject({ xp: 10, runs: 1, level: 1 }); // real-time: not yet materialized
      expect(cell(addDays(d, 1))).toEqual({ day: addDays(d, 1), xp: 0, runs: 0, level: 0 });
      expect(grid).toMatchObject({ totalXp: 270, totalRuns: 3, activeDays: 3 });

      const profile = await myProfile(me);
      expect(profile.heatmap.totalXp).toBe(270);
      expect(profile.counts.runsFinished).toBe(3);
    });
  });
});
