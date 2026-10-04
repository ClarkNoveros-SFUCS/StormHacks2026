# A social layer on top of private study: public Profiles and leaderboards on public Games only

The app started strictly solo: "no multiplayer, no crowd data, no leaderboard", and every row private to its Player. The overnight direction (decisions §6, Q8, Q11, Q12, Q17) adds Codedex-style social features: XP, Levels, ocean Ranks, Streaks, Badges, an activity heatmap, friends and leaderboards.

**Decision: Modules, Source Documents and Module Games stay private. What's shared is a public Profile and leaderboards on public Games.**

- **Profile** (visible to any signed-in Player at `/u/[username]`): username, display name, pixel avatar or Clerk photo, bio, Level, total XP, Rank, Streak, Badges, the activity heatmap, counts (Runs finished, friends, Modules, Topics passed) and best scores on **public** Games. Never a Module's name, a file, a Prompt, or a score on a private Game.
- **Leaderboards** exist only for public Games (the Daily Dive and Course Topic Games, F22/F23), for weekly XP, and for Course Topic passes. Each has a Global and a Friends scope.
- **XP comes from every finished Run**, private Games included. It's a number and a heatmap cell, not content, so it reveals only that you played. This keeps the Streak and Level honest for Players who only study their own notes.
- Personal Best and Mastery keep their meaning (your best and your coverage on one Game). A Personal Best on a public Game is also that Player's entry on its leaderboard.

## Considered options

- **Leaderboards on every Game:** rejected. A Module Game is generated from one Player's files, so no one else can play it; a board of one is pointless and would leak Game titles.
- **Share Modules (public decks):** rejected for now. It would need moderation, copyright thinking for uploaded slides, and a sharing UI. Courses (F22) cover "content everyone can play".
- **XP only from public Games:** rejected. Most play is on private Modules; Streaks and Levels would feel broken.
- **Crowd-based Rarity on public Games:** still rejected (ADR-0001). The crowd shows up only as context in the Daily Reveal ("better than X% of today's players"), never in scoring.

## Consequences

- `players` gains Profile columns (`username`, `display_name`, `image_url`, `avatar`, `use_photo`, `bio`, `banner`), filled lazily from Clerk by `ensureProfile()`.
- New tables: `xp_events` (hypertable), `player_badges`, `friendships`; continuous aggregates `player_activity_daily` and `player_xp_weekly`. See `docs/architecture/data-model.md` and `docs/architecture/social.md`.
- "Everything is private to its Player" becomes "everything **in a Module** is private": Profile and leaderboard queries may read other Players' rows, but only the columns above and only `runs` on public Games. Queries that touch Module content still filter by the caller's id.
- Which Games are public is F22's call (`games.visibility`). Until that column exists, `publicGame()` in `lib/social/profile.ts` treats Games owned by the `system` Player as public.
- Features that finish a Run, pass a Topic or play the Daily call the hooks in `lib/social/xp.ts` (`onRunFinished`, `onTopicPassed`, `onCourseFinished`, `onDailyPlayed`) inside their own transaction.
