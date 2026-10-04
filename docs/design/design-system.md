# Design system: the shared feel

The look, motion and sound shared by **every screen and every Game Mode**. Each Mode brings its own **theme** (palette, scene, mascot, sounds, wording) and its own Run and Reveal screens, built from the parts below. The first Mode, **Dive**, is specified in [`modes/dive.md`](./modes/dive.md); add one file per new Mode next to it.

Structure and content per route live in `docs/architecture/ui-map.md`. How Modes plug into generation and play: `docs/architecture/game-modes.md`.

**Mock:** open `docs/design/mock/index.html` in a browser (no build step). Use the buttons at the bottom left, or add `#modules`, `#module`, `#game`, `#run` or `#reveal` to the URL. Its files mirror this split:

| Mock file | Holds | Spec |
|---|---|---|
| `mock/core/system.css`, `core/system.js` | Tokens, recipes, components, motion, sound, stage, registries | this file |
| `mock/core/prompt-kinds.js` | Matching and the inputs for each Prompt kind, shared by Modes | this file, §6 |
| `mock/themes/ocean.js` | The ocean scene and the house theme | §3 |
| `mock/modes/dive/` | Dive's theme, Run, Reveal and Game stats | `modes/dive.md` |
| `mock/app/shell.js` | Landing, Modules, Module page, New Game dialog, Game page frame | §8 |

When the mock and the docs disagree, the docs win.

## 1. What stays the same in every Mode

These never vary by Mode. They're what makes the product feel like one product:

- **Pixel type.** `VT323` for everything game-like, and `Mulish` only for long reading text (Evidence quotes, explanations).
- **Pixel geometry.** Two-ring box-shadow borders, a 4 px drop under buttons, and no `border-radius` (the one exception is a round timer, if a theme uses one).
- **The CRT stage.** A scene canvas, a particles canvas, scanlines, a vignette, plus an edge glow and a screen flash for big moments (§3).
- **The motion vocabulary.** The same keyframes, easings and spring (§5).
- **The round loop.** Every Mode's Run is rounds of HUD → card → play area → bottom bar, ending in a results screen made of the same blocks (§6, §7).
- **Accessibility rules** (§9).

## 2. Themes

A **theme** is everything a Mode is allowed to change. It's applied by setting `data-theme="<id>"` on the stage root, which overrides the semantic tokens.

| A theme provides | Example (Dive) |
|---|---|
| Token values for §4 (colours only) | coral accent, cyan signal, gold reward, deep-navy surfaces |
| Band colours `--band-1…4` and band labels/icons | Shallows / Reef / Abyss / Trench |
| A **scene**: a canvas painter with named cameras | the ocean, with `surface`, `descent` and `deep` cameras |
| A **mascot** sprite and its reactions | pixel anglerfish: `chomp`, `sad` |
| A **sound voice** for the shared sound events (§5.3) | soft square-wave blips pitched by band |
| **Words**: the play verb, unit and section names | "BEGIN DESCENT", metres, "THE CATCH" |
| Optionally, a **score metaphor**: `formatScore(points)` | 10 m per point, shown as `−1,240 m` |

**The house theme** is used by the app shell: landing, Modules list, Module page and New Game dialog. It's the ocean surface: daylight sky, the waterline and the boat, with the Dive palette. **Mode themes** take over on that Mode's Game page, Run and Reveal. Each Game card on the Module page wears a small badge in its Mode's accent.

A theme never changes the fonts, the pixel recipes, the layout skeletons or the motion timings. If a Mode needs something that isn't here, add it here first, so every Mode can use it.

## 3. The stage (layer stack)

One full-viewport stage persists across navigations (render it in the root layout), so camera moves can animate between routes.

| z | Layer | What it is |
|---|---|---|
| 0 | `scene` canvas | The theme's painter. Low resolution (¼ of the viewport) scaled up with `image-rendering: pixelated`, for real pixel art. |
| 1 | world | The theme's sprites: the boat, the mascot, a ruler |
| 2 | `fore` canvas | Particles (§5.2) |
| 3 | content | Panels, HUD, cards, bottom bar |
| 5 | vignette | `radial-gradient(at 50% 45%, transparent 55%, rgba(2,4,10,.85))`; the theme sets the opacity per camera |
| 6 | CRT | `repeating-linear-gradient(0deg, rgba(0,0,0,.18) 0 1px, transparent 1px 3px)` + a soft vignette, opacity .45 |
| 8 | edge | inset glow in `--accent`; throbs while the round clock is hot |
| 9 | flash | full-screen flash in `--reward` for a top-band answer |

`Stage` API: `setTheme(id)`, `setCamera(name)`, `setProgress(value)` (the theme decides what it means; Dive uses metres), `flash()`, `edge(on)`, `zap()` (the CRT glitch on screen changes).

## 4. Tokens

Components use **only** these semantic names. Values below are the house theme; a theme overrides them under `[data-theme="<id>"]`. In Tailwind 4, put the names in `@theme` and the per-theme values in plain CSS blocks.

```css
:root {
  /* Surfaces */
  --bg: #050a14;        /* page, outer pixel ring */
  --bg-2: #060d1a;      /* inputs, dialogs */
  --surface: #101d33;   /* panels, cards */
  --panel: #0d1830;     /* buttons, tiles */
  --rim: #1b3050;       /* inner pixel ring */
  --drop: #0b1424;      /* 4px drop under buttons */
  /* Text */
  --text: #e8f1ff;
  --muted: #7d93b8;
  --hairline: #7d93b838;
  --on-scene-text: #0e1a2b;   /* headings drawn straight on a bright scene */
  --on-scene-muted: #3c5578;
  --on-scene-link: #0f7fa0;
  /* Roles */
  --accent: #ff5d8f;    /* brand, primary button, score, hot clock, round label */
  --signal: #4de3ff;    /* live info: timer, progress metric, focus ring, links */
  --reward: #ffd166;    /* done dots, Personal Best, top band */
  --caution: #ff9f43;   /* Hint used, points dropped */
  --danger: #ff5252;    /* failed, wrong option */
  /* Bands: a Mode's scoring tiers, lowest to highest, plus a miss */
  --band-1: #8fa3c4; --band-2: #4de3ff; --band-3: #9d7bff; --band-4: #ffd166; --band-miss: #3d4f6e;
  /* Type */
  --font-display: var(--font-vt323), ui-monospace, monospace;
  --font-read: var(--font-mulish), system-ui, sans-serif;
  /* Motion */
  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-snap: cubic-bezier(.34, 1.56, .64, 1);
  --ease-io: cubic-bezier(.65, 0, .35, 1);
  --ease-bounce: cubic-bezier(.2, 1.5, .4, 1);
}
```

Tints are derived, never hard-coded: `color-mix(in srgb, var(--signal) 25%, transparent)`.

### 4.1 Type scale (VT323 renders small)

| Role | Size | Tracking | Colour |
|---|---|---|---|
| Logo | `clamp(64px, 11vw, 112px)` | .04em | text, with `3px 0 var(--accent), -3px 0 var(--signal)` shadow |
| Page title | 44 px | 0 | text (on a bright scene: `--on-scene-text`) |
| Big number | 72–96 px | 0 | text / reward |
| Card text (prompt) | `clamp(28px, 5vw, 40px)`, line-height 1.02 | 0 | text + faint chromatic shadow |
| HUD numbers | 32 px, `tabular-nums` | 0 | signal (left) / accent (right) |
| Body | 18 px | 0 | text |
| Button | 18 px uppercase | .12em | muted (primary: text) |
| Label (section header) | 15 px uppercase | .32em | muted, dashed hairline to the right |
| Micro | 13 px uppercase | .14em | muted |
| Reading | Mulish 14 px | 0 | muted |

### 4.2 Recipes

```css
.px { background: var(--panel); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--rim), 0 4px 0 4px var(--drop); }
.px:hover  { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--signal), 0 4px 0 4px var(--drop); }
.px:active { transform: translateY(3px); box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--rim), 0 1px 0 4px var(--drop); }
.px-primary { box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--accent), 0 0 24px 2px color-mix(in srgb, var(--accent) 40%, transparent); }
.panel { background: repeating-linear-gradient(0deg, #00000029 0 1px, transparent 1px 3px), var(--surface);
         box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--rim); }
.glow-signal { color: var(--signal); text-shadow: 0 0 12px color-mix(in srgb, var(--signal) 55%, transparent); }
```

## 5. Motion, physics and sound

### 5.1 Keyframes

| Name | What | Timing | Typical use |
|---|---|---|---|
| `card-in` | from `opacity 0, translateY(46px) scale(.92)` | .7s `--ease-bounce` | cards, panels |
| `card-gone` | to `opacity 0, blur(2px), translateY(-28px) scale(.9)` | .6s ease-in | card leaving |
| `rise-in` | from `opacity 0, translateY(30px)` | .5s `--ease-out`, 60 ms stagger | list rows |
| `score-slam` | 35%: `scale(1.4) rotate(-2deg)` + reward glow | .5s `--ease-snap` | score change |
| `crank-jolt` | `translateY(-2px)` and back | .12s, while counting | counters |
| `reject-jolt` | x −8, 7, −4, 2, 0 px | .4s | wrong input |
| `shake` | ±10 px, ±.6°, decaying | .5s | timeout, one-try miss |
| `edge-throb` | opacity .15 ↔ .85 | .8s infinite | hot clock |
| `line-flash` | band glow 34 px → 16 px | .6s | band line passed |
| `title-flicker` | opacity dips 93–96% | 8s infinite | logo |
| `crt-zap` | opacity .9 → .2 → .7, 2 px jitter | .25s | screen change |
| `dot-pulse` | scale 1 ↔ 1.25 + signal glow | 1.4s infinite | current dot, live pills |
| `gold-pulse` / `gold-breathe` | reward glow 8 ↔ 26 px | 1s / 3s infinite | top-band chip, Personal Best banner |
| `banner-in` | from `scale(.6) rotate(-3deg)` | .6s `--ease-snap` | banners |
| `gild` | a segment flashes white, then settles | .9s | new Mastery segments |
| `btn-bob` | `translateY(0 ↔ -3px)` | 2.4s infinite | primary button |
| `bob` | ±4 px, ±2° | 3s infinite | sprites |

### 5.2 Physics helper (`lib/motion/`, client-only, no dependencies)

```ts
spring({ from, to, stiffness = 170, damping = 18, onUpdate, onRest }): () => void   // small overshoot, ~600 ms
emitParticles(x, y, count, color?)   // on the fore canvas: rise with buoyancy 20 px/s², drag .9/s, sine wobble, fade 1.2–2 s
```

Use the spring for counters, landing chips, reordered rows and anything that "settles". The theme decides what particles look like (Dive draws bubbles).

**Reduced motion:** springs jump to their target, particles are off, and shake, jolt, flicker, throb and zap are disabled. Colour changes stay.

### 5.3 Sound events

Modes fire **events**; the active theme's voice decides the sound. Files go in `public/sfx/<theme>/` (CC0 packs). The `lib/ui/sfx.ts` wrapper:
- respects the mute flag in `localStorage['sfx-muted']`, with the toggle tile at the top right of every screen
- does nothing until the first Play press unlocks audio

| Event | Fired when |
|---|---|
| `correct(band)` | an Answer scores (band index 1–4) |
| `wrong` | a guess is rejected |
| `ping` | each second while the clock is hot |
| `timeout` | a round runs out |
| `tick` | a keystroke in the answer input (very quiet) |
| `count` | a big number counting up |

## 6. Components

`components/ui/` (shared, theme-neutral) and `components/round/` + `components/results/` (the building blocks every Mode's Run and Reveal are made of). Mode-specific components live in `components/modes/<mode>/`.

**Shell and shared**

1. **`<Logo>`**: the product name with the chromatic shadow and `title-flicker`.
2. **`<PxButton variant="primary|default|ghost">`**: §4.2.
3. **`<Panel title>`**: §4.2. Its title is a Label with a dashed hairline to the right edge.
4. **`<Tile>`**: a square menu tile, icon above a label.
5. **`<Chip>`**: a small ringed tag. File chips: muted, with a signal ring on hover. Band chips: ring and text in the band colour.
6. **`<StatusPill status>`**: `UPLOADING` / `PARSING…` / `GENERATING…` (signal, `dot-pulse`), `READY` (reward), `FAILED` (danger, with its error message; no Retry, ADR-0003).
7. **`<Meter value segments=10>`**: a pixel bar; filled segments are reward, empty ones `--band-miss`.
8. **`<ModeTile mode locked?>`**: the Mode picker tile in the New Game dialog: the Mode's icon, name and one-line tagline, ringed in that Mode's accent when selected. A locked tile is a dashed rim with `MORE MODES SOON`.
9. **`<ModeBadge mode>`**: a small chip on Game cards and the Game page: the Mode's icon and name in its accent.
10. **`<Mascot>`**: the theme's sprite, with `bob`, a reaction API (`react('correct' | 'miss')`) and idle particles.
11. **`<Modal>`**: a Panel over a dimmed stage. Escape and the backdrop close it.

**Round building blocks (`components/round/`)**

12. **`<RoundLayout>`**: the skeleton of every Run. From the top: the HUD, the card, the **play area** (free space that the Mode owns), and the bottom bar.
13. **`<RoundHud left right index total>`**: two metric slots and the progress dots in the middle. Dots are done (reward), miss (`--band-miss`), current (signal, pulsing) or upcoming.
14. **`<RoundCard label badge text kindLine>`**: a scanlined card with an accent round label, an optional band badge on the right, the text, and a micro line describing the rules. It also has a hint slot (caution text) and a `stamp` (e.g. `TIME!`).
15. **`<RoundTimer remaining total>`**: digits plus a round scope that drains as a conic fill, with a sweep line. It turns hot (accent) at ≤ 5 s and drives the stage's edge glow. The client renders it from the server's `deadlineAt`.
16. **`<Fuse remaining total>`**: a thin bar under the input that drains with time. `cut(seconds)` flashes the lost piece after a penalty.
17. **Inputs, one per Prompt kind**, shared so that similar Modes reuse them:
    - `<TypedInput>`: open, cloze and definition Prompts. A `>` glyph, a large input, Enter submits, and it keeps focus. It shows a correction line below.
    - `<OptionGrid>`: odd-one-out. A 2×2 grid of PxButtons. Marks right/wrong and locks after one try.
    - `<OrderList>`: put-in-order. Drag with springs; rows show their position numbers.
18. **`<HintButton from to>`**: ghost style, shows the cost (`ABYSS → REEF`), and can be used once.
19. **`<ResultChip band label points>`**: the Answer in a chip ringed and glowing in its band colour. How it moves is up to the Mode (Dive sinks it).

**Results building blocks (`components/results/`)**

20. **`<ResultHeader score secondary banner>`**: a big counting number, a secondary metric (the Mode's metaphor), and an optional `NEW PERSONAL BEST` banner (`banner-in` + `gold-breathe`).
21. **`<ProgressChart series ghosts best>`**: an SVG chart of the cumulative score per round. This Run is a step line with band-coloured droplines, your last 3 Runs are faint ghost lines, and your Personal Best is a dashed reward line. The Mode chooses the axis unit through its score metaphor.
22. **`<BandTable bands value>`**: score ranges with one-line verdicts; the Player's row is lit.
23. **`<ResultList rows>`**: one row per round (band icon, prompt as a micro label, your answer, tags, points). Each row expands:
    - Open Prompts get band filter chips with counts, a search box, and every Answer with its Evidence line.
    - Single-answer Prompts get the Answer, the explanation and the Evidence.
24. **`<EvidenceLine doc page quote>`**: Mulish text, a pixel doc icon, `Week 9 slides · p.41 — "…"`.

## 7. Screens every Mode gets

| Route | Owner | Built from |
|---|---|---|
| `/` landing | shell (house theme) | Logo, how-to-play list, primary button |
| `/modules` | shell | Panel + Tiles |
| `/modules/[id]` | shell | Panels, file rows, Game cards with `ModeBadge`, New Game dialog with `ModeTile`s |
| `/games/[id]` | frame by the shell; stats and Play wording by the Mode | header, file chips, `ModeBadge`; the Mode's stats panel; recent Runs; the Mode's primary button |
| `/runs/[id]` | Mode | `RoundLayout` + the Mode's play area |
| `/runs/[id]/reveal` | Mode | results building blocks, in the Mode's order |

## 8. Shell screens (house theme)

- **Landing (signed out).** The Logo sits in the sky with the tagline under it. The boat is on the waterline. Below the surface: an expandable `▸ HOW TO PLAY` and a big `▼ SIGN IN TO DIVE ▼` primary button. (This copies the composition of Krillion's start screen.)
- **Top bar (signed in).** A menu tile at the top left, then the small Logo. At the top right, the mute tile and the Clerk `UserButton` in a pixel tile. The menu is a Modal with a 2×2 grid of Tiles.
- **`/modules`.** A page title (`--on-scene-text`, since it's drawn on the sky) and a Panel of Module Tiles showing `4 FILES · 2 GAMES` and the best result. The last tile is `+ NEW MODULE`. The empty state shows the mascot and "Create a Module for each subject you're studying."
- **`/modules/[id]`:**
  - **Files Panel.** A drop zone, then one row per file: pixel doc icon, name, page count, `StatusPill`, `USED BY 2 GAMES`, and a delete button. Delete is disabled with a tooltip while the file is in use.
  - **Games Panel.** One card per Game: title, `ModeBadge`, `StatusPill`, file chips, the Mode's best result, a Mastery `Meter`, and `PLAY ▼`. Hovering a file chip lights its file row, and the reverse.
  - **New Game dialog.** In order:
    1. **Mode** tiles: Dive plus a locked `MORE MODES SOON` tile.
    2. A title field.
    3. Checkboxes for the READY files.
    4. `CREATE GAME`, which adds the card as `GENERATING…`.

## 9. Accessibility

- Contrast: text on surface ~14:1; muted on surface ~5:1, used only for secondary text and never below 13 px. Text drawn straight on a bright scene uses the `--on-scene-*` tokens.
- Focus: `outline: 2px solid var(--signal); outline-offset: 4px` on everything interactive.
- Bands are never colour alone: always icon + name or icon + points.
- Timers announce via `aria-live="polite"` at 10 s and 5 s only. The input keeps focus between guesses.
- Reduced motion: §5.2.

## 10. Build order (F10)

1. Fonts (`next/font/google`: VT323, Mulish) and §4 tokens in `app/globals.css`, with the recipes as `@utility` and the §5.1 keyframes.
2. Shell components 1–11, which unblock F08 and F11.
3. `Stage` (`components/stage/`), with a scene registry, a camera and progress.
4. Round and results building blocks 12–24.
5. The Dive theme and screens (`modes/dive.md`, F09).

Port from the mock; don't import it.

## 11. Open

- Final product **name** and house **mascot** (working titles: SYLLABYSS, pixel anglerfish). Changing them touches `<Logo>`, the house theme and the metadata title.
- Sound pack (Kenney or another CC0 pack).
