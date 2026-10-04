# UI map

The screens and what each one shows and does. The **visual style** lives in `docs/design/design-system.md` (shared) and `docs/design/modes/<mode>.md` (one per Game Mode); this file is only about structure and content.

The shell (landing, Modules list, Module page) is the same for every Game Mode. The Game page, Run and Reveal belong to the Game's Mode (`game-modes.md`); the sections below describe **Dive**, the only Mode so far.

```
/  (landing, Clerk sign-in)
└── /modules                      Modules list
    └── /modules/[moduleId]       Module page: Files + Games
        └── /games/[gameId]       Game page: progress + Play
            └── /runs/[runId]     Run (play screen)
                └── /runs/[runId]/reveal   Reveal (results)

/explore                          Course catalogue (public, signed out too)
└── /explore/[course]             Course page: hero + numbered Topic timeline (public)
    └── /explore/[course]/[topic] Topic page: reading, resources, practice Games (public; playing needs sign-in)
                                  Practice → POST /api/games/[gameId]/runs → /runs/[runId] → Reveal (with `topic`)
```

Every route except `/`, `/sign-in` and `/sign-up` (Clerk's pages) is protected at the top of its page (`requirePlayer()`) or route handler (`getApiPlayer()`), both in `lib/auth.ts`. A signed-in user visiting `/` is redirected to `/modules`.

## `/modules`: Modules list

- One card per Module: name, file count, Game count.
- "New Module" asks for a name, creates the Module, and opens it.
- Empty state: "Create a Module for each subject you're studying."

## `/modules/[moduleId]`: Module page

Two panels side by side; stacked on mobile.

**Files panel**
- Drop zone and file picker: PDF, PPTX, DOCX, ≤ 25 MB, ≤ 100 pages.
- One row per Source Document: filename, page count, a status pill (`Uploading`, `Parsing…`, `Ready`, `Failed` with its error message; the Player deletes it and uploads again), and **"Used by N Games"**.
- Delete is disabled while the file is used, with a tooltip: "Used by Graphs Midterm, Week 9 Drill. Delete those Games first."

**Games panel**
- One card per Game: title, a **Mode badge** (e.g. `DIVE`), status (`Generating…`, `Ready`, `Failed`), **chips naming the files it was built from** (e.g. "📄 Week 8 slides · 📄 Week 9 slides"), Personal Best, a Mastery bar, and a **Play** button.
- "New Game" opens a dialog: first a row of **Game Mode tiles** (Dive, plus a locked "More modes soon" tile until a second Mode exists; Dive is preselected), then a title field, a checkbox list of this Module's **Ready** files (at least one), and a Create button. The Game appears immediately as `Generating…`.
- Hovering a file chip highlights that file in the Files panel, and hovering a file highlights the Games that use it. This makes the file ↔ Game relationship obvious.

## `/games/[gameId]`: Game page

- Title, the Mode badge, source file chips, created date. The stats below and the Play button's wording come from the Mode (Dive: "Begin descent").
- **Personal Best** (big number) and **Mastery** (percentage), plus per-Tier found counts ("deep 2/9 · rare 1/12").
- Recent Runs: date, score, and a link to each Reveal.
- **Play** button, which creates a Run and navigates to `/runs/[runId]`.
- Optional: the accuracy-over-time chart from the continuous aggregate (`data-model.md`).

## `/runs/[runId]`: Run (play screen, Dive)

- Position "3 / 7", current Run score, and a 25 s countdown that visibly jumps when a wrong guess costs 3 s.
- Prompt text.
- Input, depending on the Prompt kind:
  - Typed (open, cloze, definition): one text box. Enter submits and the box clears. A wrong guess shakes the box and shows −3 s.
  - Odd-one-out: 4 option buttons, one tap.
  - Put-in-order: draggable list plus a Submit button.
- **Hint** button on single-answer Prompts that have a Hint. It reveals the clue inline, shows that the Tier dropped (e.g. "deep → solid"), and is used once.
- On a correct answer: the matched Answer, its Tier and the points pop up (with a "repeat answer" tag when Staleness applied), then a short transition to the next Prompt.
- On a timeout: "Time!", then the next Prompt.
- The clock starts only after the Prompt is on screen (the client calls `start-prompt` after the entry transition).

## `/runs/[runId]/reveal`: Reveal (Dive)

- Run total, a **New Personal Best!** banner when it applies, and Mastery before → after.
- One section per Prompt:
  - your answer and points (with Staleness/Hint notes)
  - **Open Prompts:** every Answer grouped by Tier (common → rare), found ones ticked and missed ones listed, each showing "📄 Week 9 slides · p.41" and the Evidence quote on hover or tap
  - **Single-answer Prompts:** the correct Answer, the explanation and the Evidence page
- Buttons: Play again, Back to Game.
- **Course practice Games:** when `reveal.topic` is set, Back goes to the Topic page, and `topic.passedNow` triggers the Topic-pass moment (pixel burst, +150 XP, the Topic Badge, then the next Topic's unlock animation when `topic.unlockedNext`; Course Badge when `topic.courseFinished`) (Q27).

## `/explore`, `/explore/[course]`, `/explore/[course]/[topic]`: Courses (F22 backend, F27 UI)

All three are public (Q24): signed out they render without progress and the Play buttons ask to sign in. Data and shapes: [`courses.md`](./courses.md) § API.

- **`/explore`** (`GET /api/courses`): a card per Course with banner, level chip, topic count, minutes, Modes and, signed in, progress (`passed / total`, Continue → `nextTopicSlug`).
- **`/explore/[course]`** (`GET /api/courses/[slug]`): banner hero (title, level, description, CTA to the next Topic), numbered Topic timeline (each Topic: number, title, summary, minutes, Mode icons, state locked / unlocked / passed and read), sidebar with progress and the Topic and Course Badges (`badgeInfo(badgeId)`).
- **`/explore/[course]/[topic]`** (`GET /api/courses/[slug]/topics/[topicSlug]`): the reading page by page (markdown with code blocks) with an optional **Mark as read** (`POST …/read`, +20 XP, gates nothing); resources (title, source, link); a **Practice** panel with one tile per Mode (pass bar text, your best and a passed tick), and Play → `POST /api/games/[gameId]/runs` (403 = locked: show "Pass Topic N−1 first"); prev/next Topic links, "Next topic" highlighted once passed.
