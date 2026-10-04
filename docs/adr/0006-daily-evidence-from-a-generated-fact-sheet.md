# Daily Dive Answers are grounded in a generated fact sheet, not a Player's file

Every Answer in the game has **Evidence**: a page of a Source Document that states it, shown in the Reveal. Until now those documents were always files a Player uploaded (or, for Courses, hand-written readings), and the generator was told to use "only facts stated in the pages". The Daily Dive (F23, decisions §7, Q9, Q23) is general-knowledge trivia that no Player uploaded, so there is no document to ground it in.

**Decision: each Daily puzzle comes with its own fact sheet, written together with the puzzle, stored as a parsed Source Document of the system Player. Page N of the fact sheet is the Evidence for Prompt N, and a second, separate Gemini call verifies every Answer before the puzzle is kept.**

- The fact sheet is written by Gemini in the same call as the Prompts (or by hand, for the seed pool). It states every accepted Answer in a sentence that shows why it fits.
- The usual checks still apply unchanged: every Answer's quote must be verbatim on its page, the Answer must be named there, Hints mustn't give it away (`lib/games/validate.ts` through `checkPuzzle`).
- Because the sheet and the Answers come from the same model, the quote check alone proves only consistency, not truth. So a **verification call** (temperature 0, a fact-checker instruction) judges each Answer against general knowledge *and* the page. Unsupported Open Answers are dropped; an unsupported single-answer Prompt rejects the puzzle.
- The Reveal shows the fact sheet page like any Evidence (`documentTitle` = "Daily Dive #N · … (fact sheet)").

## Considered options

- **No Evidence for Daily Answers:** rejected. The Reveal, the Evidence links and the "every answer comes from a source" promise would need a special case, and nothing would check Gemini's Answers.
- **Ground the Daily in real public sources (Wikipedia pages fetched at generation):** rejected for now. Licensing, fetching and page-size handling for one daily puzzle is a lot of machinery; a verified fact sheet gets most of the benefit. Possible later with F18's retrieval work.
- **Trust one Gemini call:** rejected. The second call is cheap (about a quarter of the cost of the first) and catches wrong or stretched Answers.

## Consequences

- "Evidence comes from the Player's own notes" becomes "Evidence comes from a Source Document": a Player's file, a Course reading, or a Daily fact sheet. Module Games are unchanged.
- Hand-written seed puzzles follow the same rule (fact sheet pages in `db/seed/daily/pool.json`) and pass the strict checks.
- A wrong fact can still slip through if both calls agree on it. Puzzles stay in the pool before they go live, so they can be read and fixed first; a live puzzle is never edited (people played it).
