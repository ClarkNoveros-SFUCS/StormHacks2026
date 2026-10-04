# Pairs: match terms to definitions

Rules and words from F20; visuals and screens built in F25 (`components/modes/pairs/`). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q19, §14.

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
| Board start button | **MATCH ▶** (Enter also deals) |
| Match | "Pair!" `+50 PAIR!` |
| Mismatch | "Not a pair" `−10 · −2 s` (just `−2 s` at a score of 0) |
| Board cleared | **BOARD CLEAR** `+5 × N s left`, the bonus counting up |
| Clock runs out | "Time!" `N OF 6 PAIRED` |
| Both cleared | **ALL PAIRS!** (outcome `cleared`) |
| Results screen title | **PAIRS #N · THE TABLE** (every pair with its Evidence) |
| Play again | **DEAL AGAIN ▶** |
| Accent | `#ff9f43` orange (`MODE_UI.pairs`), gold `#ffd166` for rewards |

## Visuals (F25)

Theme `[data-theme="pairs"]` in `app/globals.css`; recipes in `components/modes/pairs/pairs.module.css`.

- **The room:** green card-table felt (`--felt`) with a faint 16 px pixel checker, a vignette and a slowly breathing lamp light. Pixelify Sans for terms and headings, Mulish for definitions, VT323 for the HUD.
- **The table:** a rounded felt panel framed by a stepped wooden rim (`--wood`, a light bevel, `--wood-dark`, a hard drop shadow). Column labels `◆ TERMS` (gold) and `■ DEFINITIONS` (violet).
- **Cards:** cream (`--card`) with a 2 px ink pixel edge, a bevel and a drop. Terms carry a gold diamond pip, definitions a violet square pip. On desktop the two columns share grid rows, so each row lines up like a table. Hover lifts and tilts a card; the picked card lifts higher with a squash and a glow ring in its suit colour.
- **Face down:** before a Board starts the 12 cards are dealt face down (woven red backs for terms, violet for definitions, a gold diamond emblem). After `start-prompt` the faces flip up one by one (`deal-flip`, 55 ms stagger, tick sounds).
- **Match:** both cards flash bright and snap (`card-snap`, green edge); a gold pixel link line draws between them with square rivets at the ends; `+50 PAIR!` pops at the line's midpoint; spark particles burst there; the mascot cheers. After ~0.6 s both cards fly into their slot in the **MATCHED** tray under the table (shrink, spin, fade) and a chip lands there with a pop; the cards leave dashed ✓ ghost slots so nothing reflows.
- **Mismatch:** both cards turn red-edged and shake; `−10 · −2 s` pops in red; the clock bar flashes red; the mascot sulks.
- **Clock:** big VT323 seconds plus a full-width striped bar that drains, green → gold (≤ 50%) → red (≤ 25%), throbbing in the last 10 s.
- **Board clear:** a cream panel over the table, **BOARD CLEAR**, `+5 × N s left`, the bonus counting up with ticks, then the score odometer rolls, a confetti burst, and `BOARD 2 NEXT…` (or `ALL PAIRS!`). Board 2 opens on its own intro with Board 1's result.
- **Time!:** the remaining cards grey out and a red **Time!** panel shows how many were paired.
- **Phones (< 640 px):** the terms become a wrapping row of chips above a single stack of definition cards; the link line runs vertically between them.

## Reveal

`PAIRS #N · THE TABLE`: the big counting score with `ALL PAIRS` / `TIME!`, NEW PERSONAL BEST, the Topic banner when the Game is a Course Topic's (F22), four stat plates (boards cleared, pairs, misses, time bonus), the pass-bar line, then one felt table per Board (cleared or time ran out, seconds, misses, bonus) listing every pair as a cream card: term, definition, ✓ +50 or ✗ missed, explanation, Evidence (links to the Module's file viewer). Mastery before → after, **DEAL AGAIN ▶**, BACK TO GAME.

## Keyboard and accessibility

Roving focus: ↑ ↓ move within a column, ← → jump to the other column (Tab also moves between the two columns), Enter / Space picks; after picking with the keyboard the focus jumps to the other column. Esc clears the selection. Enter deals a Board from its intro. Matches, misses, Board ends and the clock (every 10 s, then each of the last 5) are announced through `aria-live`. Reduced motion: no flips, flights or particles (cards simply turn into ghosts).
