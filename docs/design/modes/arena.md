# Arena: shoot the right answer

Rules, look and screens from F29 (`lib/modes/arena/`, `lib/runs/engines/arena.ts`, `components/modes/arena/`, three.js). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` Q22 and §14.

## Rules (`docs/architecture/run-and-scoring.md` § Arena)

- 10 multiple-choice questions (Leap's kind and generator), 20 s each. The stem floats on a **holo-board**; the 4 options are **targets** (A cyan, B violet, C gold, D pink) drifting at different depths.
- **A hit is an answer.** The right target **explodes** and closes the question: (100 + speed bonus up to 50) × Leap's streak multiplier (×1.5 at 3 in a row, ×2 at 5+), less 25 per wrong target hit first, never below 25.
- A wrong target **shatters**: −3 s on the question's clock, −25 on its points, the streak resets, and you keep shooting the rest. If the penalty empties the clock, the question is over.
- Out of time: 0 points. No hearts and no lifeline; every Run plays all 10.
- The targets appear only after `start-prompt` (a 3·2·1 countdown on the board first). Shots that hit no target are free (no penalty, not sent).

**Pass bar:** at least 7 of 10 right.

## Words

| Thing | Word |
|---|---|
| Play button | **ENTER ARENA** (`✛ ENTER ARENA ✛`) |
| Right hit | "Direct hit!" + points, `+188 · ×1.5`; the pop says `×1.5 streak`, `−25 for misses`, `quick draw!` or `direct hit` |
| Wrong hit | target shatters, `−3 s` drops from the timer, red vignette flash |
| Timeout | "Time up" / board: **TOO SLOW**; after a penalty: "The penalty ran the clock out" / **OUT OF TIME** |
| Run ends | **ARENA CLEARED** |
| Results screen title | **AFTER-ACTION REPORT · RUN #N** |
| Between rounds | `NEXT ROUND · 5 ▸` (auto after 6 s; shoot or Enter to skip) |
| Streak | "3 in a row · ×1.5", "5 in a row · ×2" |
| Accent | `#ff4d6d` (hot red, the crosshair), trims `#4de3ff` / `#9d7bff` / `#ffd84d` / `#ff5d8f` |

Target colours are never the only cue: each target carries its letter, and the screen reader gets the question and every target as text (an `aria-live` line plus a visually hidden list of "1 · A · …" buttons that shoot that target).

## Look

A neon training arena at night in the site palette. Theme `[data-theme="arena"]` (`components/modes/arena/arena.css`, scoped `.ar-root`): glassy navy HUD plates (`.ar-plate`) with a cyan edge glow, cards (`.ar-card`) with hot-red corner brackets like the holo-board, pressable buttons (`.ar-btn`, red primary with a dark drop), Pixelify Sans for titles and buttons, VT323 for HUD numbers, Mulish for questions and options. Ligatures are off (Pixelify draws "fi" badly).

## The room (`scene.ts`, three.js)

- **Arena:** a 30 × 31 m room: pixel floor tiles with a cyan grid (nearest-filtered canvas texture), panelled walls with seams, neon trim strips at floor and head height (pink/cyan/gold/violet, gently pulsing), violet chevrons, ceiling light panels, four hex pillars with neon rings, low-poly crates with cyan edges, a hexagonal spawn pad, a faint red target lane, and drifting dust motes.
- **Holo-board:** a floating translucent panel on a projector beam at the back wall: `QUESTION n / 10 · SHOOT THE RIGHT TARGET` and the stem, word-wrapped and fitted (4 lines max). Between rounds it shows the countdown, the result (`DIRECT HIT · +188` with the explanation, or `TIME UP`), and at the end `ARENA CLEARED`. It bobs and flickers slightly.
- **Targets:** glowing panels (letter badge + option text on a canvas texture, coloured frame, additive glow) that warp in with an overshoot, drift on slow Lissajous orbits at depths 1.5–6 m in front of the player, and always face you. Slots rotate per question so the same letter isn't always in the same place; phones use a tighter stacked layout.
- **Blaster:** a low-poly gun on the camera (bottom right, smaller on phones) with a red stripe; each shot kicks it back, flashes the muzzle (sprite + point light) and draws a laser tracer to the hit point, with sparks where it lands.
- **Right hit:** a 200-particle burst in green/gold/white, two shockwave rings, a green flash light, camera shake; the other targets power down and pop away. **Wrong hit:** the target breaks into 18 tumbling shards that bounce on the floor, red sparks and ring, a smaller shake. **Timeout:** the targets fizzle out in grey sparks.

## Controls

- **Desktop:** `ENTER ARENA` locks the mouse (pointer lock): mouse to aim, click to shoot, WASD/arrows to walk (Shift runs) inside the spawn area, **Esc pauses** (the next round's countdown waits; a question's clock is the server's and keeps running, the pause card says so). `RESUME` re-locks; "Resume with click-to-aim" plays without the lock.
- **Click-to-aim** (no lock, or when the browser refuses it, e.g. in an iframe or an automated tab): click a target to shoot it; a notice explains the fallback and `LOCK MOUSE ▸` tries again.
- **Touch:** tap a target to shoot, drag to look around.
- **Keys 1–4** shoot target A–D directly (the blaster swings to it). Enter skips the wait between rounds.
- If WebGL fails, the targets become a visible list of buttons and keys 1–4 still work.

## Run screen (`ArenaRunScreen.tsx`)

- **HUD:** pause tile and ARENA + Game title (left); `Q n / 10` with ten squares (green right, red miss, red outline now), the big 20.0 s timer (red, blinking and a red vignette under 5 s; `−3 s` drops from it on a wrong hit) and a cyan→red time bar (centre); SCORE, the flame streak chip and `next ×1.5 · ×2 in 2` (right), mute.
- **Crosshair** (locked) with a hit marker (white on a hit, green on a kill, red on a wrong one). On phones the question also shows in a card under the HUD (the board is too small to read there).
- **Intro:** ARENA title, the rules in one paragraph, chips (multipliers, `wrong hit −3 s`, `pass: 7 of 10`), the controls line, **✛ ENTER ARENA ✛** and "Play without locking the mouse (click to aim)". A reload between questions shows **Ready? NEXT ROUND ▸**; a reload mid-question puts the remaining targets straight back.
- **Result card:** "Direct hit! +188 · ×1.5 · 1 miss first" and the explanation, or "Time up"; `NEXT ROUND · 6 ▸` counts down.
- **End:** **ARENA CLEARED** with the score, then the After-Action Report.

## After-Action Report (`ArenaRevealScreen.tsx`)

The room stays behind the column (the camera pans slowly; the board shows the score, right count and accuracy). Contents: `AFTER-ACTION REPORT · RUN #N`, the score with `✛ 84% ACCURACY`, NEW PERSONAL BEST, Topic passed banner (Course Games), stats (right x/10, accuracy with the wrong-hit count, best streak, fastest hit), **✛ PLAY AGAIN** / Back to Game, the distribution of your runs (0–2,550), the **ROUND LOG** (one bar per question, height by points, a red tick per wrong hit), Mastery, and **EVERY QUESTION**: each row shows your hit trail (`D ✗ · A ✓ in 6.2 s`) and expands to all four options (the right one ✓, the ones you shattered ✗ −3 s), the explanation and the Evidence line linking into the Module's file viewer.

## Motion and performance

Dynamic import of three.js from `ArenaStage`, device pixel ratio capped at 2, paused while the tab is hidden, everything (geometries, materials, canvas textures, renderer) disposed on unmount, pointer lock released. Particles are one pooled `Points` buffer; shards, rings and tracers are short-lived and freed. Reduced motion: no camera shake, no walk bob or gun sway, slower target drift, still neon and board, CSS animations off. Sounds are synthesized (`sfx.laser`, `sfx.shatter`, `sfx.blast` plus the shared ones) and respect mute. In `next dev` the live scene is on `window.__arena`, and `.step(ms)` advances a frame by hand (background tabs don't run rAF).
