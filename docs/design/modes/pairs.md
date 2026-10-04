# Pairs: match terms to definitions

**Stub (F20).** Rules and words only; the visual spec (bright pixel card table, flip/snap animations) is written by the UI lane (F25). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q19.

## Rules (`docs/architecture/run-and-scoring.md` § Pairs)

- 2 **Boards** of 6 pairs. Each Board has a 60 s clock that starts with `start-prompt` (show a "Board 1 · MATCH" start beat; the cards stay face down until then).
- **Two columns**: terms on the left, definitions on the right, both shuffled. Click (or tab + Enter) a term, then a definition; the server checks the pair.
- Match: +50, the two cards lock together and fade to "matched". Mismatch: −10 (the score never drops below 0) and −2 s off the clock; shake both cards.
- A Board ends when all 6 are matched (+5 per second left: count the bonus up) or its clock runs out. Board 2 always follows.
- Opaque ids: the UI never knows which definition belongs to which term until the server says so.

**Pass bar:** clear both Boards.

## Words

| Thing | Word |
|---|---|
| Play button | **MATCH** |
| Match | "Pair!" `+50` |
| Mismatch | "Not a pair" `−10 · −2 s` |
| Board cleared | **BOARD CLEAR** `+5 × seconds left` |
| Clock runs out | "Time!" |
| Both cleared | **ALL PAIRS** (outcome `cleared`) |
| Results screen title | **THE TABLE** (every pair with its Evidence) |
| Accent | `#ffd166` (gold), from `MODES.pairs.accent` |

Keyboard: arrow keys move within a column, Enter selects, Tab switches columns. Announce matches through `aria-live`.
