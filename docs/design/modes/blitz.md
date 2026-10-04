# Blitz: true or false, fast

Rules and words from F20; visuals and screens built in F25 (`components/modes/blitz/`). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` Q20, §14.

## Rules (`docs/architecture/run-and-scoring.md` § Blitz)

- One 60 s clock for the whole Run, started by `start-prompt` ("3, 2, 1, GO").
- Statements come one at a time; answer **TRUE** or **FALSE** (keys ← / → or T / F, two big buttons on mobile). The next statement arrives in the same response.
- Correct: +10. Once 5 are already in a row (the **Combo**), each further correct scores 20: show the combo meter filling and a ×2 badge (`state.nextPoints`).
- Wrong: the Combo resets and 3 s come off the clock (flash the clock).
- The Run ends when the clock hits 0, or early if every statement in the deck has been answered.

**Pass bar:** 150 points.

## Words

| Thing | Word |
|---|---|
| Play button | **GO ▶** (Enter also starts) |
| Correct | `+10` / `+20`, "RIGHT · IT'S TRUE" |
| Wrong | "NOPE −3 s · IT'S TRUE" |
| Combo | meter "N TO ×2", then "COMBO ×2" from 5 in a row (`COMBO ×2!` pops when it lights) |
| Time up | **TIME!** (outcome `time_up`) |
| Deck finished early | **DECK CLEARED** (outcome `deck_cleared`) |
| Results screen title | **BLITZ #N · REPLAY** (every statement shown, with its truth, explanation and Evidence) |
| Play again | **GO AGAIN ▶** |
| Accent | `#ff3df0` magenta and `#3dfcff` cyan (`MODE_UI.blitz`), acid yellow `#f6ff3d` for rewards |

## Visuals (F25)

Theme `[data-theme="blitz"]` in `app/globals.css`; recipes in `components/modes/blitz/blitz.module.css`.

- **The cabinet:** a synthwave night: twinkling pixel stars, an outrun sun with widening stripes sitting on the horizon, a perspective neon grid floor scrolling toward you (magenta rows, cyan columns), CRT scanlines and a vignette over everything. VT323 for all numbers and labels, Pixelify Sans for statements.
- **The beat:** a synthesized drum-machine loop at 120 BPM (`useBeat`, voices from `sfx.drum` in `lib/ui/sfx.ts`, so mute applies): four-on-the-floor kick and offbeat hats; in a combo a snare backbeat, 16th hats and a bass line join; in the last 10 s a high blip ticks every beat. One clock drives the sound and the visuals: every frame writes the pulse (1 on the beat, decaying) to `--beat`, which brightens the grid and the sun, swells the glows on the HUD boxes, the statement card and the TRUE/FALSE buttons, and bumps the ×2 badge.
- **HUD:** score box (odometer, neon yellow) on the left, the big pink clock in the centre with a magenta → cyan bar, the combo box on the right (count, 5 segments that light cyan, all yellow once ×2 is on, `N TO ×2` → `COMBO ×2`).
- **Start:** a **BLITZ** neon title (flickering), the rules as four neon chips, and a big GO button; then 3, 2, 1, GO slam in on the beat (blips) and `start-prompt` starts the clock on GO.
- **Statements:** one neon-framed card at a time sliding in from the right with a skew; answered cards leave left, green-edged if right or dropping and red-edged if wrong.
- **Correct:** a cyan flash, `+10` (cyan) or `+20` (yellow) pops under the score, sparks burst from the score box, the correct chime (higher at ×2).
- **Wrong:** the whole screen glitches (RGB jitter, slices, hue shift) with a red flash; the clock jolts red; `−3 s` pops; the combo box flashes and empties; "NOPE −3 s · IT'S TRUE" in RGB-split type for ~1.5 s.
- **End:** a big neon **TIME!** or **DECK CLEARED** with the right/wrong count, then the Reveal.
- **Phones:** the two answer buttons fill the bottom half-and-half (big targets), the statement sits in the middle, the mute tile moves under the buttons.

## Reveal

`BLITZ #N · REPLAY`: score with `TIME!` / `DECK CLEARED`, NEW PERSONAL BEST, the Topic banner for a Course Topic's Game (F22), stat boxes (accuracy, best combo, right, wrong), the pass-bar line, **THE RUN** (a strip of cells, one per statement: cyan +10, yellow +20, red wrong, grey no answer), then **EVERY STATEMENT** with an All / Missed filter: the statement, its truth (`TRUE` / `FALSE` badge), what you said (✓ / ✗ / no answer), points, explanation and Evidence. Mastery before → after, **GO AGAIN ▶**, BACK TO GAME.

## Accessibility

Keys ← / F false, → / T true, Enter starts. Results and the clock (every 10 s and each of the last 5) go through `aria-live`. Reduced motion: no pulse, no glitch, no floor scroll (the beat still plays unless muted).
