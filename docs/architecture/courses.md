# Courses, Topics and public Games

A **Course** is a public, seeded learning path anyone can follow (the first is **Python Basics**). It's a list of **Topics**; each Topic has a reading, learning resources and practice Games, one per Game Mode. **Passing** any practice Game of a Topic unlocks the next Topic. Terms: `CONTEXT.md` (Course, Topic, Pass, Public Game). Decisions: overnight-decisions §5, Q10, Q24, Q27.

## How it's stored: Courses reuse Modules and Games

```
system Player ('system')
└── Module "Python Basics"                         courses.module_id
    ├── Source Document "Python Basics 1 · Hello World & Syntax"   (the Topic's reading; its pages = the reading's pages)
    │   └── Source Pages 1..n                       practice Prompts' Evidence points here
    └── Games (visibility = 'public', status = 'ready'): one per (Topic, Mode)
courses 1──N course_topics 1──N topic_games (one per Mode) N──1 games
Player  1──N topic_progress N──1 course_topics
```

- The **system Player** (`players.id = 'system'`) owns the Course Modules and their Games. It never signs in and never has a Profile (`system` is a reserved username).
- Each Topic's **reading** is a parsed Source Document, so Evidence in the Reveal points at real reading pages (`documentTitle` = the reading's title, `pageNumber` = its page).
- Practice Games are ordinary Games built from hand-written Prompts with the same writers and checks as generation (below). Runs, `guess_events`, Personal Best and Mastery on them stay per Player.

## Public Games

`games.visibility` is `'private'` (default: every Module Game) or `'public'` (Course practice Games, and later the Daily Dive).

| | private Game | public Game |
|---|---|---|
| Start a Run (`POST /api/games/[gameId]/runs`) | owner only (else 404) | any signed-in Player (403 if it's a locked Topic's Game) |
| Runs, guesses, Personal Best, Mastery | the owner's | each Player's own |
| Leaderboard (`/api/leaderboards/games/[gameId]`) | 404 | yes (`publicGame()` in `lib/social/profile.ts`) |
| Module page, files, `GET /api/games/[gameId]` | owner only | owner only (the system Player); Players see Topic Games through the Courses API |

`lib/progress.ts` counts a public Game's Answers for any Player (Mastery), still only from that Player's own guesses.

## Unlock rule and Pass

- Topic 1 is always unlocked. Topic N+1 unlocks once **any** practice Game of Topic N is passed. A passed Topic is never locked. (`lockedTopics()` in `lib/courses/rules.ts`.)
- A **Pass** is a finished Run that meets its Mode's pass bar (F20's `passedRun(summary)`): Dive and Apogee score ≥ 150; Leap ≥ 7 of 10 right without falling; Pairs both Boards cleared; Blitz ≥ 150. Text for the Topic page: `PASS_BAR_TEXT` in `lib/modes/rules.ts`.
- Practice is playable straight away. **Mark as read** is optional and gates nothing (Q27).
- Readings and the catalogue are public; locked Topics still show their reading. Only starting a practice Run on a locked Topic is refused (403).

## What happens when a Run finishes

Every command in `lib/runs/run-engine.ts` that can finish a Run (any Mode: state, start-prompt, timeout, guess, hint, answer, pair, lifeline) goes through `play()`. When the Run goes from in progress to finished during the command, `afterFinish()` runs **once, in the same transaction**:

1. `onRunFinished(playerId, { runId, ...summary }, tx)` (F21): Run XP (`floor(score/5)`, 5..200) and Run Badges. For **every** Run, on any Game.
2. `recordTopicRun(tx, playerId, run, summary)` (`lib/courses/progress.ts`), only for a Topic practice Game:
   - updates `topic_progress.modes[mode] = { best, passed, runs }`;
   - on the Topic's **first** Pass: sets `passed_at`, `passed_run_id`, `passed_mode`, calls `onTopicPassed` (+150 XP, Badge `topic-<course>-<n>`); if every Topic of the Course is now passed, `onCourseFinished` (+500 XP, Badge `course-<course>`).

The hooks are idempotent ((player, reason, ref) once), so a repeat Pass awards nothing.

The Reveal (`GET /api/runs/[runId]/reveal`) of a Topic Game carries `topic: TopicReveal`: `{ courseSlug, courseTitle, topicSlug, topicNumber, topicTitle, passed, passedNow, passedBefore, nextTopicSlug, unlockedNext, courseFinished }` (`null` for any other Game). `passedNow` = this Run is the Topic's first Pass; `unlockedNext` = it unlocked `nextTopicSlug`; `courseFinished` = it completed the Course. The UI uses them for the pixel burst, +150 XP, Badge and unlock animation (Q27).

## API

Types: `lib/courses/types.ts` (client-safe). Errors are `{ error }`.

| Method | Route | Auth | Returns |
|---|---|---|---|
| GET | `/api/courses` | public | `{ courses: CourseSummary[] }` (published, catalogue order) |
| GET | `/api/courses/[slug]` | public | `{ course: CourseDetail }`; 404 |
| GET | `/api/courses/[slug]/topics/[topicSlug]` | public | `{ topic: TopicDetail }`; 404 |
| POST | `/api/courses/[slug]/topics/[topicSlug]/read` | signed in (401) | `TopicReadResponse { progress, xp }`; 404 |
| POST | `/api/games/[gameId]/runs` | signed in | `{ runId }`; 403 locked Topic, 404 private Game of someone else |

Signed out, every `progress` and `me` field is `null` (no lock state either; the UI shows "Sign in to play").

```ts
CourseSummary { slug, title, level, summary, banner, topicCount, minutes, modes, badgeId,
                progress: { passed, total, finished, nextTopicSlug } | null }
CourseDetail  = CourseSummary & { description, topics: TopicSummary[] }
TopicSummary  { number, slug, title, summary, minutes, modes, badgeId, progress: TopicProgress | null }
TopicProgress { locked, passed, passedAt, read, readAt }
TopicDetail   { course: { slug, title, topicCount, badgeId }, number, slug, title, summary, minutes,
                resources: { title, url, source? }[],
                reading: { documentId, title, pages: { pageNumber, contentMd }[] },
                games: { mode, gameId, title, promptCount, passBar, me: { best, passed, runs } | null }[],  // MODES order
                prev, next: { slug, title } | null, badgeId, progress: TopicProgress | null }
```

Badge names and icons: `badgeInfo(badgeId)` from `lib/social/badges.ts`.

## Seed

`npm run db:seed:courses` reads every `db/seed/courses/*.json` (`-- <file>` for one, `-- --check` to validate without the database). The file shape is checked strictly by `npm run seed:content:check` (`scripts/check-seed-content.ts`): `course { slug, title, level, summary, description, banner_theme, estimated_minutes }` and `topics[] { slug, order, title, summary, minutes, reading.pages[] { page_number, content_md }, resources[] { title, url, source }, games[] { mode, title, prompts | prompts_from: "dive" } }`, with each Mode's prompts in that Mode's Gemini response shape.

`lib/courses/seed.ts`:
1. `checkCourse(file)` runs every Game through its Mode's own generation checks (`generatorFor(mode).validate`, duplicate texts, `finalize`, `minPrompts`), the same as a generated Game, so `answer_keys` come from `normalize()` and Open Tiers from `assignOpenTiers`. Anything the pipeline would drop or clear is an error.
2. `buildCourseRows()` derives every id from the content (md5 → uuid): the Course and Topic from their slugs; the reading document from its text; each Game from its document, Mode, title and Prompts.
3. `seedCourse(tx, rows)` upserts the system Player, the Module, the Course and its Topics, inserts documents and Games that don't exist yet, and points `topic_games` at them.

It's **idempotent and never deletes play history**: unchanged content writes nothing new. Changed content makes a new Game (Games are immutable), the Topic points at it, and the old Game is **retired** (set private): its Runs, guesses and history stay. A Topic removed from the file is deleted (with its `topic_progress`); its Games are retired.

## Code

| File | Responsibility |
|---|---|
| `lib/courses/types.ts` | API shapes (client-safe) |
| `lib/courses/rules.ts` | `lockedTopics`, `nextTopicIndex`, `recordRun` (per-Mode record + pass dispatch), `sortModes` (pure) |
| `lib/courses/progress.ts` | `assertTopicUnlocked`, `recordTopicRun`, `topicReveal` (called by the run engine, inside its transaction) |
| `lib/courses/queries.ts` | `listCourses`, `getCourse`, `getTopic`, `markTopicRead`, `CourseError` |
| `lib/courses/http.ts` | `courseRoute` (optional or required sign-in, errors → status) |
| `lib/courses/seed.ts`, `scripts/seed-courses.mts` | the seed |
| `db/migrations/20261004T1100_courses.sql` | `games.visibility`, the system Player, the four tables |
