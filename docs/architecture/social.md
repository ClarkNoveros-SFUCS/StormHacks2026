# Social layer: Profiles, XP, Levels, Streaks, Badges, Friends, Leaderboards

Built in F21 (#34). Why it exists and what stays private: [ADR-0005](../adr/0005-social-layer.md). Tables and aggregates: [`data-model.md`](./data-model.md#social-tables-f21-adr-0005). Terms: `CONTEXT.md` § Social.

All code is in `lib/social/`. Server modules take `playerId` first and an optional `db` (the shared client or your transaction) last, like `lib/progress.ts`.

| File | What |
|---|---|
| `types.ts` | Client-safe API shapes and constants (`RANKS`, `AVATARS`, `USERNAME_PATTERN`). Import from UI. |
| `rules.ts` | XP amounts, `xpForRun`, `xpForDaily`, `levelFor`, `rankFor`, `heatLevel`. Pure, client-safe. |
| `badges.ts` | `BADGES` catalogue, `badgeInfo(id)`, `topicBadgeId`, `courseBadgeId`, criteria. Pure, client-safe. |
| `days.ts` | Vancouver days, `computeStreak`. Pure. |
| `username.ts` | Validation, slugify, derivation and de-duplication. Pure. |
| `xp.ts` | `awardXp`, `awardBadge`, `totalXp`, `streakFor`, and the hooks `onRunFinished`, `onTopicPassed`, `onTopicRead`, `onCourseFinished`, `onDailyPlayed`. |
| `profile.ts` | `ensureProfile`, `updateProfile`, `profileFor`, `myProfile`, `profileCard`, `playerSummaries`, `publicGame`. |
| `activity.ts` | `heatmap` (53 weeks, gap-filled). |
| `friends.ts` | Requests, accept/decline/remove, lists, search. |
| `leaderboards.ts` | `weeklyXp`, `gameLeaderboard`, `courseLeaderboard`. |
| `http.ts` | `socialRoute` wrapper for route handlers, `parseScope`, `parseLimit`. |

## XP

Each event earns XP **once** (keyed by `(player, reason, ref)`), so every hook is safe to call twice.

| Event | XP | `reason` / `ref` | Who calls it |
|---|---|---|---|
| Run finished (any Mode, any Game) | `floor(score / 5)`, at least 5, at most 200 | `run_finished` / run id | F20, via `onRunFinished` |
| Topic passed (first time) | 150 | `topic_passed` / `<course>:<n>` | F22, `onTopicPassed` |
| Topic reading marked as read (Q27) | 20 | `topic_read` / `<course>:<n>` | F22, `onTopicRead` |
| Course finished | 500 | `course_finished` / `<course>` | F22, `onCourseFinished` |
| Daily Dive played (counted Run) | 50 + 5 × current Streak, bonus capped at 50 | `daily_played` / `YYYY-MM-DD` | F23, `onDailyPlayed` |

Abandoned Runs earn nothing. XP is awarded at the event's time (a Run's `finished_at`), so the heatmap and Streak put it on the right day.

## Levels and Ranks

Level n starts at `50·(n−1)·n` total XP: L1 0, L2 100, L3 300, L4 600, L5 1,000, L10 4,500. (Decisions §6 wrote the formula as `50·n·(n+1)` but listed these values; the values win.) `levelFor(xp)` returns `{ level, totalXp, levelStartXp, nextLevelXp, xpIntoLevel, xpForNext, rank }`; draw the bar as `xpIntoLevel / xpForNext`.

| Levels | Rank |
|---|---|
| 1–2 | Plankton |
| 3–4 | Shrimp |
| 5–7 | Reef Fish |
| 8–11 | Dolphin |
| 12–16 | Orca |
| 17+ | Leviathan |

## Streak

Consecutive **America/Vancouver** days with at least one finished Run (`run_finished` XP events). `current` counts back from today if today is played, otherwise from yesterday: the flame stays lit until today ends, and `playedToday: false` tells the UI to nudge. `longest` is the best ever. A Run at 23:59 and one at 00:01 Vancouver time are two days.

## Heatmap

`heatmap(playerId)` → `Heatmap`: every Vancouver day from the Sunday 52 weeks before this week's Sunday through today (365–371 days), oldest first, so day `i` sits in column `floor(i / 7)`, row `i % 7` (Sunday at the top). Each day has `xp`, `runs` (finished) and `level` 0–4 by XP: 0 none, 1 < 40, 2 < 100, 3 < 200, 4 ≥ 200. Reads the `player_activity_daily` continuous aggregate with `time_bucket_gapfill`.

## Badges

Catalogue in code (`BADGES`), held in `player_badges`. Each Badge has `id`, `name`, `description`, `icon` (pixel icon id for the UI) and `tier` (bronze/silver/gold).

| id | Name | Earned when | Evaluated by |
|---|---|---|---|
| `first-dive` | First Dive | first finished Run | `onRunFinished` |
| `trench-diver` | Trench Diver | a rare-tier Answer found in a Run (Dive/Apogee) | `onRunFinished` (reads `guess_events.tier` for the Run) |
| `perfect-leap` | Perfect Leap | Leap Run not fallen with `correct === questions` | `onRunFinished` (summary stats) |
| `pairs-speedrun` | Pairs Speedrun | Pairs `outcome: "cleared"` with `stats.timeBonus ≥ 300` (≥ 60 s left in total) | `onRunFinished` |
| `streak-7`, `streak-30` | Week of Tides, Moon Cycle | longest Streak reaches 7 / 30 | every hook |
| `level-5`, `level-10` | Reef Regular, Deep Veteran | Level 5 / 10 | every hook |
| `topic-<course>-<n>` | e.g. "Python Basics: Topic 3" | Topic n passed | `onTopicPassed` |
| `course-<course>` | e.g. "Python Basics Graduate" | Course finished | `onCourseFinished` |
| `daily-top-10` | Daily Top 10 | top 10 of a Daily Dive | F23 calls `awardBadge(playerId, "daily-top-10", day)` |

`badgeInfo(id)` resolves any of these, including generated Topic/Course ids. `badgeCatalogue()` lists them for a "locked badges" view.

## Profiles and usernames

- `ensureProfile(playerId, clerkUser?)` gives a Player a username the first time it's needed: the Clerk username, else full name, else email local part, slugified to `^[a-z0-9_]{3,20}$`, with a number appended if taken (`anton`, `anton2`…). It also fills `display_name` and `image_url`. One select once done. `socialRoute` calls it for every social API request; a page can call it with `await currentUser()` to refresh the Clerk photo.
- Avatars: 16 pixel avatar ids in `AVATARS` (default `anglerfish`); `use_photo` shows the Clerk photo instead. A `PlayerSummary.imageUrl` is non-null only when the Player chose their photo.
- Reserved usernames (`admin`, `me`, `system`, `requests`, …) are never derived and are refused (409) on edit.

## Friends

One `friendships` row per pair. `sendFriendRequest(me, username)`: pending; if they had already asked you, it accepts theirs; asking twice is a no-op. Accept/decline only by the addressee. `removeFriend(me, username)` deletes the row in any state (unfriend, cancel, decline). Search matches a prefix of the username or display name, case-insensitive, never yourself, and includes your friend status with each result.

## Leaderboards

Every board returns `{ board, scope, period, entries, me, total }`: the top `limit` (default 50), plus `me`, your own row even outside the top. `place` uses `rank()` (equal values share a place). Scope `friends` = your accepted friends plus you.

| Board | Value | Order | Source |
|---|---|---|---|
| `weeklyXp` | XP this Vancouver week (Mon–Sun) | XP desc | `player_xp_weekly` continuous aggregate |
| `gameLeaderboard(gameId, { day?, counting? })` | one counted Run per Player: `best` (default; highest, earliest on a tie) or `first` (first finished, for the Daily's one counted attempt); `day` limits to Runs finished that Vancouver day | score desc, then finish time asc | `runs` |
| `courseLeaderboard({ course? })` | Topics passed | count desc, then whoever got there first | `topic_passed` XP events |

`gameLeaderboard` returns null (API 404) unless the Game is public. **Public Games:** F22 decides; until `games.visibility` exists, `publicGame()` treats Games owned by the `system` Player (or with `visibility = 'public'` once the column appears) as public.

## API

Every route starts with `getApiPlayer()` (401 when signed out), then `ensureProfile`. Errors are `{ error }` with 400/404/409. Types from `lib/social/types.ts`.

| Method | Route | Body / query | Returns |
|---|---|---|---|
| GET | `/api/me/summary` | | `ProfileCard` (player, level, totalXp, badgeCount, streak) |
| GET | `/api/me/profile` | | `{ profile: MyProfile }` |
| PATCH | `/api/me/profile` | `ProfilePatch` `{ username?, displayName?, avatar?, usePhoto?, bio?, banner? }` (null clears bio/banner) | `{ profile: MyProfile }`; 400 bad field, 409 username taken |
| GET | `/api/me/heatmap` | | `Heatmap` |
| GET | `/api/profiles/[username]` | | `{ profile: PublicProfile }`; 404 |
| GET | `/api/players/search` | `?q=&limit=` (≤ 50, default 20) | `{ players: PlayerSearchResult[] }` |
| GET | `/api/friends` | | `FriendsList { friends, incoming, outgoing }` |
| POST | `/api/friends/requests` | `{ username }` | 201 `{ status: "pending" \| "accepted", requestId }`; 400 self, 404, 409 already friends |
| POST | `/api/friends/requests/[requestId]/accept` | | 204; 404 |
| POST | `/api/friends/requests/[requestId]/decline` | | 204; 404 |
| DELETE | `/api/friends/[username]` | | 204; 404 |
| GET | `/api/leaderboards/weekly-xp` | `?scope=global\|friends&limit=` | `Leaderboard` |
| GET | `/api/leaderboards/games/[gameId]` | `?scope=&day=YYYY-MM-DD&counting=best\|first&limit=` | `Leaderboard`; 404 unless public |
| GET | `/api/leaderboards/course` | `?scope=&course=<slug>&limit=` | `Leaderboard` |

`PublicProfile` (others) vs `MyProfile` (yourself): `MyProfile` adds `usePhoto` and `clerkImageUrl` for the edit dialog. Neither has any Module content; `bests` lists only public Games.

## Hooks for other features

```ts
import { onRunFinished, onDailyPlayed, onTopicPassed, onCourseFinished, awardBadge } from "@/lib/social/xp";

// F20, inside the transaction that sets status = 'finished' (summary = F20's RunSummary):
const award = await onRunFinished(playerId, { runId, ...summary }, tx);
// F22, when a Topic is first passed / the last Topic of a Course is passed:
await onTopicPassed(playerId, { course: "python-basics", topicNumber: 3 }, tx);
await onCourseFinished(playerId, "python-basics", tx);
// F23, for the counted Daily Run, after onRunFinished:
await onDailyPlayed(playerId, "2026-10-04", tx);
await awardBadge(playerId, "daily-top-10", "2026-10-04", tx); // when the day's top 10 is known
```

Each returns `XpAward { xpAwarded, totalXp, levelBefore, levelAfter, leveledUp, newBadges, streak }`; the Reveal can show "+104 XP", a level-up burst and new Badges. Runs that finished without the hook (or before it existed) get their XP from `npm run social:backfill` (idempotent).
