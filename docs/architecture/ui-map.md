# UI map

The screens and what each one shows and does. The **visual style** (Krillion-like look, motion and physics) is specified separately in `docs/design/`; this file is only about structure and content.

```
/  (landing, Clerk sign-in)
└── /modules                      Modules list
    └── /modules/[moduleId]       Module page: Files + Games
        └── /games/[gameId]       Game page: progress + Play
            └── /runs/[runId]     Run (play screen)
                └── /runs/[runId]/reveal   Reveal (results)
```

Every route except `/` is protected by calling `requirePlayer()` (`lib/auth.ts`) at the top of its page or route handler. A signed-in user visiting `/` is redirected to `/modules`.

## `/modules`: Modules list

- One card per Module: name, file count, Game count.
- "New Module" asks for a name, creates the Module, and opens it.
- Empty state: "Create a Module for each subject you're studying."

## `/modules/[moduleId]`: Module page

Two panels side by side; stacked on mobile.

**Files panel**
- Drop zone and file picker: PDF, PPTX, DOCX, ≤ 25 MB, ≤ 100 pages.
- One row per Source Document: filename, page count, a status pill (`Uploading`, `Parsing…`, `Ready`, `Failed`, with Retry), and **"Used by N Games"**.
- Delete is disabled while the file is used, with a tooltip: "Used by Graphs Midterm, Week 9 Drill. Delete those Games first."

**Games panel**
- One card per Game: title, status (`Generating…`, `Ready`, `Failed`), **chips naming the files it was built from** (e.g. "📄 Week 8 slides · 📄 Week 9 slides"), Personal Best, a Mastery bar, and a **Play** button.
- "New Game" opens a dialog: a title field, a checkbox list of this Module's **Ready** files (at least one), and a Create button. The Game appears immediately as `Generating…`.
- Hovering a file chip highlights that file in the Files panel, and hovering a file highlights the Games that use it. This makes the file ↔ Game relationship obvious.

## `/games/[gameId]`: Game page

- Title, source file chips, created date.
- **Personal Best** (big number) and **Mastery** (percentage), plus per-Tier found counts ("deep 2/9 · rare 1/12").
- Recent Runs: date, score, and a link to each Reveal.
- **Play** button, which creates a Run and navigates to `/runs/[runId]`.
- Optional: the accuracy-over-time chart from the continuous aggregate (`data-model.md`).

## `/runs/[runId]`: Run (play screen)

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

## `/runs/[runId]/reveal`: Reveal

- Run total, a **New Personal Best!** banner when it applies, and Mastery before → after.
- One section per Prompt:
  - your answer and points (with Staleness/Hint notes)
  - **Open Prompts:** every Answer grouped by Tier (common → rare), found ones ticked and missed ones listed, each showing "📄 Week 9 slides · p.41" and the Evidence quote on hover or tap
  - **Single-answer Prompts:** the correct Answer, the explanation and the Evidence page
- Buttons: Play again, Back to Game.
