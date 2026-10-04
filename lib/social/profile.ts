import "server-only";
import { z } from "zod";
import { sql } from "@/lib/db";
import { heatmap } from "./activity";
import { badgeInfo } from "./badges";
import { friendStatuses } from "./friends";
import { SocialError } from "./errors";
import { levelFor } from "./rules";
import {
  baseUsername, displayNameFrom, firstFreeUsername, normalizeUsername, usernameProblem,
  type ClerkProfileSource,
} from "./username";
import { AVATARS, type EarnedBadge, type GameBest, type MyProfile, type PlayerSummary, type ProfileCard, type PublicProfile } from "./types";
import { streakFor, totalXp, type Db } from "./xp";

// Profiles: filling them in from Clerk, editing them, and the public payloads.
// A Profile never includes Module content: only counts and bests on public Games.

/** F22's system Player owns the Course Modules and Games; it never has a Profile. */
export const SYSTEM_PLAYER_ID = "system";

/** Whether Game `g` is public (anyone signed in can play it, so it has a leaderboard): F22's games.visibility. */
export function publicGame(db: Db) {
  return db`(g.visibility = 'public')`;
}

async function fetchClerkUser(playerId: string): Promise<ClerkProfileSource | null> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    return await (await clerkClient()).users.getUser(playerId);
  } catch {
    return null; // dev ids, Clerk down: fall back to a derived username
  }
}

/**
 * Makes sure the Player has a username (and display name and Clerk photo), and returns it.
 * Cheap once filled in: one select. Call it from pages that show the signed-in Player
 * (social route handlers already do, via socialRoute).
 *   clerkUser: pass Clerk's `currentUser()` if you have it; omit to fetch it only when the
 *   Profile is incomplete; pass null to never call Clerk (tests).
 */
export async function ensureProfile(playerId: string, clerkUser?: ClerkProfileSource | null, db: Db = sql): Promise<string> {
  await db`insert into players (id) values (${playerId}) on conflict (id) do nothing`;
  const [row] = await db<{ username: string | null; image_url: string | null }[]>`
    select username, image_url from players where id = ${playerId}`;

  if (row.username) {
    // Keep the Clerk photo fresh when the caller hands us the Clerk user anyway
    if (clerkUser?.imageUrl && clerkUser.imageUrl !== row.image_url) {
      await db`update players set image_url = ${clerkUser.imageUrl} where id = ${playerId}`;
    }
    return row.username;
  }

  const source = clerkUser === undefined ? await fetchClerkUser(playerId) : clerkUser;
  const base = baseUsername(source);
  const prefix = base.slice(0, 16).replace(/_/g, "\\_"); // '_' is a LIKE wildcard
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await db<{ username: string }[]>`
      select username from players where username like ${prefix + "%"}`;
    const candidate = attempt === 0
      ? firstFreeUsername(base, taken.map((t) => t.username))
      : firstFreeUsername(`${base.slice(0, 15)}${Math.floor(Math.random() * 1000)}`, taken.map((t) => t.username));
    try {
      const [set] = await db<{ username: string }[]>`
        update players
        set username = ${candidate},
            display_name = coalesce(display_name, ${displayNameFrom(source, candidate)}),
            image_url = coalesce(${source?.imageUrl ?? null}, image_url)
        where id = ${playerId} and username is null
          and not exists (select 1 from players where username = ${candidate})
        returning username`;
      if (set) return set.username;
      const [now] = await db<{ username: string | null }[]>`select username from players where id = ${playerId}`;
      if (now.username) return now.username; // filled in by a concurrent request
    } catch (e) {
      if ((e as { code?: string }).code !== "23505") throw e; // unique violation: someone took it, retry
    }
  }
  throw new Error(`Couldn't pick a username for ${playerId}`);
}

type PlayerRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar: string;
  use_photo: boolean;
  image_url: string | null;
  xp: number;
};

function toSummary(r: PlayerRow): PlayerSummary {
  const lv = levelFor(r.xp);
  return {
    username: r.username,
    displayName: r.display_name ?? r.username ?? "Diver",
    avatar: r.avatar,
    imageUrl: r.use_photo ? r.image_url : null,
    level: lv.level,
    rank: lv.rank,
  };
}

/** PlayerSummary for many Players in one query. Unknown ids are left out of the Map. */
export async function playerSummaries(ids: string[], db: Db = sql): Promise<Map<string, PlayerSummary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db<PlayerRow[]>`
    select p.id, p.username, p.display_name, p.avatar, p.use_photo, p.image_url,
           coalesce(x.xp, 0)::int as xp
    from players p
    left join (
      select player_id, sum(amount) as xp from xp_events where player_id in ${db(unique)} group by player_id
    ) x on x.player_id = p.id
    where p.id in ${db(unique)}`;
  return new Map(rows.map((r) => [r.id, toSummary(r)]));
}

/** The home page's profile card (Q12): GET /api/me/summary. */
export async function profileCard(playerId: string, db: Db = sql, now = new Date()): Promise<ProfileCard> {
  const [summaries, xp, streak, [{ badges }]] = await Promise.all([
    playerSummaries([playerId], db),
    totalXp(playerId, db),
    streakFor(playerId, db, now),
    db<{ badges: number }[]>`select count(*)::int as badges from player_badges where player_id = ${playerId}`,
  ]);
  const player = summaries.get(playerId);
  if (!player) throw new SocialError(404, "Player not found");
  return { player, level: levelFor(xp), totalXp: xp, badgeCount: badges, streak };
}

async function buildProfile(viewerId: string, playerId: string, db: Db, now: Date): Promise<MyProfile> {
  const [row] = await db<{ bio: string | null; banner: string | null; use_photo: boolean; image_url: string | null; created_at: Date }[]>`
    select bio, banner, use_photo, image_url, created_at from players where id = ${playerId}`;
  const [summaries, xp, streak, badgeRows, grid, [counts], bests, statuses] = await Promise.all([
    playerSummaries([playerId], db),
    totalXp(playerId, db),
    streakFor(playerId, db, now),
    db<{ badge_id: string; earned_at: Date }[]>`
      select badge_id, earned_at from player_badges where player_id = ${playerId} order by earned_at desc, badge_id`,
    heatmap(playerId, db, now),
    db<{ runs: number; friends: number; modules: number; topics: number }[]>`
      select
        (select count(*) from xp_events where player_id = ${playerId} and reason = 'run_finished')::int as runs,
        (select count(*) from friendships
          where status = 'accepted' and (requester = ${playerId} or addressee = ${playerId}))::int as friends,
        (select count(*) from modules where player_id = ${playerId})::int as modules,
        (select count(*) from xp_events where player_id = ${playerId} and reason = 'topic_passed')::int as topics`,
    db<{ gameId: string; title: string; mode: string; best: number; finishedAt: Date }[]>`
      select distinct on (r.game_id) r.game_id as "gameId", g.title, g.mode, r.score as best, r.finished_at as "finishedAt"
      from runs r join games g on g.id = r.game_id
      where r.player_id = ${playerId} and r.status = 'finished' and r.finished_at is not null and ${publicGame(db)}
      order by r.game_id, r.score desc, r.finished_at asc`,
    viewerId === playerId ? Promise.resolve(null) : friendStatuses(viewerId, [playerId], db),
  ]);

  const badges: EarnedBadge[] = badgeRows.flatMap((b) => {
    const info = badgeInfo(b.badge_id);
    return info ? [{ ...info, earnedAt: b.earned_at.toISOString() }] : [];
  });
  const gameBests: GameBest[] = bests
    .sort((a, b) => b.best - a.best)
    .slice(0, 24)
    .map((b) => ({ ...b, finishedAt: b.finishedAt.toISOString() }));
  const status = statuses?.get(playerId) ?? { status: viewerId === playerId ? "self" : "none", requestId: null };

  return {
    player: summaries.get(playerId)!,
    bio: row.bio,
    banner: row.banner,
    joinedAt: row.created_at.toISOString(),
    level: levelFor(xp),
    totalXp: xp,
    streak,
    badges,
    heatmap: grid,
    counts: { runsFinished: counts.runs, friends: counts.friends, modules: counts.modules, topicsPassed: counts.topics, badges: badges.length },
    bests: gameBests,
    friendStatus: status.status,
    friendRequestId: status.requestId,
    usePhoto: row.use_photo,
    clerkImageUrl: row.image_url,
  };
}

/** Public Profile by username (any signed-in viewer), or null if there's no such Player. */
export async function profileFor(viewerId: string, username: string, db: Db = sql, now = new Date()): Promise<PublicProfile | null> {
  const [p] = await db<{ id: string }[]>`
    select id from players where username = ${normalizeUsername(username)} and id <> ${SYSTEM_PLAYER_ID}`;
  if (!p) return null;
  const full = await buildProfile(viewerId, p.id, db, now);
  if (viewerId === p.id) return full;
  const { usePhoto: _u, clerkImageUrl: _c, ...pub } = full; // private fields stay with the owner
  void _u; void _c;
  return pub;
}

/** The caller's own Profile with the editable fields: GET /api/me/profile. */
export async function myProfile(playerId: string, db: Db = sql, now = new Date()): Promise<MyProfile> {
  return buildProfile(playerId, playerId, db, now);
}

const BANNER = /^[a-z0-9-]{1,32}$/;
const patchSchema = z.strictObject({
  username: z.string().optional(),
  displayName: z.string().trim().min(1, "Display name can't be empty").max(40, "Display name is at most 40 characters").optional(),
  avatar: z.enum(AVATARS).optional(),
  usePhoto: z.boolean().optional(),
  bio: z.string().trim().max(160, "Bio is at most 160 characters").nullable().optional(),
  banner: z.string().regex(BANNER, "Unknown banner").nullable().optional(),
});

/**
 * PATCH /api/me/profile. 400 on a bad field, 409 if the username is taken. Returns the
 * updated Profile.
 */
export async function updateProfile(playerId: string, body: unknown, db: Db = sql): Promise<MyProfile> {
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) throw new SocialError(400, parsed.error.issues[0]?.message ?? "Invalid profile");
  const patch = parsed.data;

  let username: string | undefined;
  if (patch.username !== undefined) {
    username = normalizeUsername(patch.username);
    const problem = usernameProblem(username);
    if (problem === "format") throw new SocialError(400, "Usernames are 3–20 lowercase letters, digits or underscores");
    if (problem === "reserved") throw new SocialError(409, "That username is taken");
    const [taken] = await db`select 1 from players where username = ${username} and id <> ${playerId}`;
    if (taken) throw new SocialError(409, "That username is taken");
  }
  const bio = patch.bio === undefined ? undefined : patch.bio === "" ? null : patch.bio;

  try {
    await db`
      update players set
        username     = coalesce(${username ?? null}, username),
        display_name = coalesce(${patch.displayName ?? null}, display_name),
        avatar       = coalesce(${patch.avatar ?? null}, avatar),
        use_photo    = coalesce(${patch.usePhoto ?? null}::boolean, use_photo),
        bio          = case when ${bio !== undefined} then ${bio ?? null} else bio end,
        banner       = case when ${patch.banner !== undefined} then ${patch.banner ?? null} else banner end
      where id = ${playerId}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new SocialError(409, "That username is taken");
    throw e;
  }
  return myProfile(playerId, db);
}
