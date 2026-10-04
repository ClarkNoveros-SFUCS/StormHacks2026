# Dive: the Krillion-style Game Mode

The first Game Mode. A Run is 7 Prompts at 25 s each, and less obvious correct Answers score more. The score is shown as **depth**: every point sinks you 10 metres, and the camera really descends through a tall ocean as you score. Rules and scoring: `docs/architecture/run-and-scoring.md` and `game-generation-pipeline.md`. Everything not listed here (tokens, recipes, motion, sound engine, the round and results building blocks) comes from [`../design-system.md`](../design-system.md). Spec of record for this layout: `docs/worklog/aaf1007/overnight-decisions.md` §3 and Q6.

**Try it:**
- Mock: `docs/design/mock/index.html#run` (plain HTML, real descent, catch screen) and `#reveal`.
- App: `/styleguide` → **Dive playground** (dev only), a fake 7-Prompt Dive run client-side with the real components.

In the mock, try `kruskal`, `floyd warshal` (a typo that still matches), `hopcroft karp` (a Trench Answer), a wrong guess (−3 s), the Hint button, dragging to reorder, and odd-one-out.

## 1. Reference: Krillion

Studied from krillion.io (start, run, catch and results screens; screenshots on Anton's Desktop, 2026-10-04).

| We copy | We make our own |
|---|---|
| The ocean world: pixel sky → waterline → dark sea, the boat on the surface | The mascot (pixel anglerfish, not a krill) |
| The run layout: three HUD plates in a centred row, menu/mute tiles at the sides, prompt card under the waterline, depth ruler with `YOU ◀` on the right edge, bottom dock with sonar clock, input, fuse and DIVE button | Tier names, creature icons, flavour lines and all wording |
| The catch screen after a correct answer: creature icon, tier name, the answer in quotes, `+60 PTS · sink 600m`, a verdict line, `DESCEND ▼` | Prompt kinds beyond open answers (cloze, definition, order, odd-one-out) |
| The results column over the sea: score + depth, distribution chart, dive log, "The Bearing", "The Catch" | The distribution: your own past Runs for private Games; today's players only for public Games (Daily, Course) |
| Score as depth: 10 m per point | Evidence: every Answer links to a page of your notes |

## 2. Dive theme

`[data-theme="dive"]` on the Run/Reveal root (and the Dive stats block on the Game page). It brings back the Krillion recipes for this Mode only: **VT323 everywhere** (`--f-display` is VT323), **no radius**, **two-ring pixel borders** with a 4 px drop (`.dv-px`, `.dv-panel`), and the **CRT overlay** (`.dv-crt`: scanlines + vignette).

| Token | Value | Use |
|---|---|---|
| `--bg` / `--bg-2` | `#050a14` / `#060d1a` | outer pixel ring, input |
| `--surface` / `--surface-2` | `#101d33` / `#0d1830` | prompt card / plates, tiles |
| `--border` (`--dive-rim`) | `#1b3050` | inner pixel ring |
| `--dive-drop` | `#0b1424` | 4 px drop under buttons |
| `--text` / `--muted` | `#e8f1ff` / `#7d93b8` | |
| `--primary` = `--accent` | `#ff5d8f` | DIVE / DESCEND buttons, score, round label, hot clock, YOU marker |
| `--signal` | `#4de3ff` | depth, timer, fuse, focus ring |
| `--reward` | `#ffd166` | done squares, Personal Best, Trench |
| `--band-1…4` | `#8fa3c4` `#4de3ff` `#9d7bff` `#ffd166` | Shallows, Reef, Abyss, Trench |
| `--band-miss` | `#3d4f6e` | timeout, one-try miss |

- **Score metaphor:** `formatDepth(points) = −(points × 10) m`, e.g. `−1,240 m`. A Run maxes out at 700 points, which is −7,000 m. (`components/modes/dive/depth.ts`.)
- **Mascot:** the pixel anglerfish with a gold lantern (`Mascot`, the same sprite as the site mascot). During a Run it wanders on the left side of the water, idle-bobbing and blowing bubbles; it reacts `happy` on a catch and `sad` on a miss or timeout. On the Reveal it sits top right.
- **Particles:** bubbles (2–4 px pixel squares) via `lib/motion` (`kind: "bubble"`).
- **Sound voice** (synthesized, `lib/ui/sfx.ts`):
  - `correct(band)`: two-note blip pitched up by band; Trench adds a sparkle.
  - `catch(band)`: the catch screen appears.
  - `sink()`: the camera descends.
  - `wrong()`: low thud · `ping()`: sonar ping each hot second · `timeout()`: descending buzz · `tick()`: keystrokes · `count()`: counters.
- **Words:**
  - Play: `▼ BEGIN DESCENT ▼`; play again: `▼ DIVE AGAIN ▼`; submit: `DIVE`; continue after a catch: `DESCEND ▼`.
  - Runs are called "dives" in copy. The domain term stays Run.
  - Under the prompt: `▼ rarer answers sink deeper ▼`.

## 3. Tiers on screen

| Tier (code) | Display | Points | Sink | Band | Creature icon | Catch verdict (examples) |
|---|---|---|---|---|---|---|
| common | **Shallows** | 10 | 100 m | `--band-1` | bubble | "The obvious one. It counts." |
| solid | **Reef** | 25 | 250 m | `--band-2` | small fish | "Solid. Swimming with the school." |
| deep | **Abyss** | 60 | 600 m | `--band-3` | jellyfish | "Genuinely uncommon. Nice pull." |
| rare | **Trench** | 100 | 1,000 m | `--band-4` | lantern (anglerfish) | "Straight from the footnotes." |
| miss | Miss | 0 | — | `--band-miss` | dim bubble | — |

- A hinted Prompt shows its dropped tier and a caution `HINT` tag. A hinted common Prompt is worth 5.
- An Answer reduced by Staleness shows the reduced points and a muted `REPEAT ÷2` tag.
- Code: `components/modes/dive/tiers.ts` exports `TIER_UI: Record<Tier, { label, band, icon, depth, verdicts }>` (band = CSS colour var, depth = metres for that tier's points).

## 4. Game page stats (`/games/[id]`)

The shell draws the frame (title, file chips, `ModeBadge`, recent Runs). Dive fills the stats block, inside `data-theme="dive"`, with the ocean at the surface behind it:
- `PERSONAL BEST −1,200 M` in reward
- `MASTERY 31%` with a `Meter`
- `FOUND`: per-tier icon rows like `SHALLOWS 9/11`

Its Play button is `▼ BEGIN DESCENT ▼`. Pressing it unlocks audio, creates the Run and routes to the Run, where the camera starts at the surface.

## 5. Real descent: the ocean depth world

Depth is a **real camera position** in a tall world, not a colour fade. `OceanStage` (`components/modes/dive/OceanStage.tsx`) is a full-viewport canvas drawn at low resolution and scaled up (`image-rendering: pixelated`). Its camera has a world y in metres; `setDepth(metres)` moves it.

- **Scale:** every point scored moves the camera 10 m down. The world spans 0 → 7,000 m (the Run maximum) plus margin. Screen mapping (`components/modes/dive/depth.ts`): `pxPerMetre = viewportHeight / 300` (100 m ≈ a third of the screen, so the first catch scrolls the waterline out of view), and the camera's depth sits 25% down the screen at the surface, easing to 45% once deeper than 300 m. One `DiveCamera` instance drives the canvas, the ruler and the HUD without React re-renders.
- **Start:** camera at the surface. The sky fills the top ~25% of the screen, the pixel boat (red flag) sits on the waterline, the prompt card sits just under the waterline.
- **On a score:** the camera springs to the new depth (stiffness ~60, damping ~14, a long glide with a slight settle, ~1.2–2 s) while `sfx.sink()` plays and bubbles stream up past the screen. On the **first** catch the waterline and boat scroll up out of view. Under reduced motion it cuts.
- **Between Prompts** the camera holds at your depth: the sea stays dark once you're deep. It never rises back up during a Run.

**Depth zones** (`depthZone(m)` in `tiers.ts`; compressed from the real ocean zones to fit a 0–7,000 m game; everything blends across boundaries):

| Zone | Depth | Water colour (top → bottom) | Light | Life |
|---|---|---|---|---|
| Surface | above 0 m | day sky `#cfe3f2` → haze `#eef5fb`, waterline with foam | sun | boat, gulls |
| Sunlit | 0–200 m | `#2d6a9a` → `#1d4a73` | slanted god rays, shimmering | small fish schools, krill specks |
| Twilight | 200–1,000 m | `#1d4a73` → `#0e2747` | rays fade out | jellyfish, lanternfish, sparse schools |
| Midnight | 1,000–3,000 m | `#0e2747` → `#07142a` | none; bioluminescent dots | anglerfish lures, siphonophores |
| Abyss | 3,000–5,500 m | `#07142a` → `#050a14` | none | giant squid silhouette, gulper eels |
| Trench | 5,500–7,000 m+ | `#050a14` → `#03060c` | none; faint glow from vents | trench walls at the sides, amphipods |

- **Marine snow** drifts down everywhere below 200 m, denser and slower with depth. Particles are parallaxed (two layers) so the descent reads as motion.
- **Creatures** are pixel silhouettes picked by the camera's zone; they drift across slowly and are culled off-screen. Cheap: a few dozen sprites at most.
- **Depth ruler** (`DepthRuler`): a vertical tick ruler on the right edge, a minor tick every 20 m and a label every 100 m (`-100m`, `-200m`, …; every 500 m once deep). It scrolls with the camera. A pink **`YOU ◀`** marker sits at your current depth and slides down on the same spring.

## 6. Run (`/runs/[id]`)

```
        ┌─────────────┐        ■ ■ ■ ▣ □ □ □         ┌─────────────┐
        │ DEPTH       │        PROMPT 4 OF 7          │       SCORE │     ← DiveHud: three HudPlates in a centred row
        │ −1,240m     │                               │         124 │        (depth in signal, ProgressSquares, score in accent)
        └─────────────┘                               └─────────────┘
 [≡]                                                                [🔊]  ← menu tile left, mute tile right (below the HUD row)
                        ~~~~ boat ~~~~                              ─┤
 ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ waterline (start only) ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ ─┤
               ┌──────────────────────────────────────┐              ─┤ -1,200m
               │ PROMPT 4 OF 7                          │              ─┤
               │ Name a graph algorithm                 │              ─┤
               │ ▼ rarer answers sink deeper ▼          │       YOU ◀ ─┤   ← DepthRuler on the right edge
               └──────────────────────────────────────┘              ─┤
   - - - - - - - - - - - - - - - - - - - - - - - ◌ SHALLOWS 100 M    ─┤   ← TierLines (play area)
   - - - - - - - - - - - - - - - - - - - - - - - ≻ REEF 250 M        ─┤ -1,300m
 (mascot)               [ KRUSKAL ] +25                               ─┤   ← the sinking chip
   - - - - - - - - - - - - - - - - - - - - - - - ⌘ ABYSS 600 M       ─┤
   - - - - - - - - - - - - - - - - - - - - - - - ✦ TRENCH 1,000 M    ─┤
                (◔ 18)  [ type one answer…          ]  [ DIVE ]           ← bottom dock: SonarTimer, TypedInput, DIVE
                        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░ fuse      [? HINT]          ← Fuse under the input; HintButton beside/under
```

- **HUD:** `DiveHud` = `DEPTH` plate (signal) left of centre, `ProgressSquares` + `PROMPT n OF 7` in the middle, `SCORE` plate (accent) right of centre. Squares: done (reward), miss (`--band-miss`), current (accent, `dot-pulse`), upcoming (dark).
- **Card:** `RoundCard` centred just under the waterline (at depth: in the upper third). Pink tracking label, the prompt in big VT323, the micro line `▼ rarer answers sink deeper ▼` (single-answer kinds show their tier, e.g. `THIS ONE SINKS TO ABYSS · 600 M`).
- **Play area:** `TierLines`, dashed lines at 16%, 40%, 66% and 90% of the space between card and dock, each tagged with icon, name and sink depth on the right.
  - Single-answer Prompts: the line the Prompt will score on is marked `THIS PROMPT ▸` and the others dim. The Hint moves the mark up one line.
  - Put-in-order: the `OrderList` sits over the lines until `LOCK IN ▼` is pressed. Odd-one-out: the `OptionGrid` sits there.
- **Dock (bottom, centred):** round `SonarTimer` (digits in the middle, sweep), the wide `TypedInput` (`type one answer…`) with the `Fuse` right under it, and the `DIVE` button on the right. On mobile the dock pins to the bottom above the keyboard.

### 6.1 A correct answer: sink, then catch

1. **Chip sinks.** The chip (a `ResultChip`, dropped via `TierLines`' `sink` prop) appears under the card and sinks on a spring (stiffness 120, damping 14), so it overshoots and bobs back to rest on its tier line. Each line it passes plays `line-flash` in that line's band colour. On landing: `+25` floats up, the score slams, the depth plate counts up, the square turns reward, the mascot reacts `happy`, 8 bubbles rise. A Trench answer releases 24 gold bubbles and pulses the chip gold.
2. **Camera descends** to the new total depth (§5) while the chip settles (~1 s after landing starts).
3. **Catch screen** (`CatchScreen`, Krillion's catch image). The prompt card and tier lines fade (`card-gone`); centred on the dark water:
   - the tier's pixel creature icon, glowing in band colour, bobbing
   - the tier name big (`TRENCH` in band colour)
   - the answer in quotes (`"Hopcroft–Karp"`)
   - `+100 PTS · sink 1,000m` (points in band colour)
   - a one-line flavour verdict (`TIER_UI[tier].verdicts`, picked at random)
   - tags when they apply: `HINT`, `REPEAT ÷2`
   - a primary **`DESCEND ▼`** button at the bottom, with a thin auto-continue bar under it.
   `sfx.catch(band)` plays as it appears.
4. **Continue:** `DESCEND ▼`, **Enter**, or **auto after ~6 s**. Then the next Prompt's card plays `card-in`.

**The clock is paused during the catch screen.** No server change is needed: a correct answer closes the Prompt, and the next Prompt's 25 s clock starts only when the client calls `POST /api/runs/[runId]/start-prompt`. So the client calls `start-prompt` **after** `DESCEND` (once the next card has entered), never while the catch screen is up. The client's `SonarTimer` shows full time until `deadlineAt` arrives.

### 6.2 Misses

- **Wrong typed guess:** the input plays `reject-jolt`, `−3s` floats up from the clock, the fuse cuts 3 s, `sfx.wrong()`. The correction line reads `<guess> · not in your notes`. Never say "wrong": it may be an Off-syllabus guess. The Prompt stays open.
- **One-try miss** (put-in-order, odd-one-out): the card shakes, the right option lights, the correction line says `One try · it was Dijkstra`, the square turns miss, the mascot looks sad. A short miss card (`MISSED · it was Dijkstra`, no sink) then the next Prompt; no descent.
- **Timeout:** at ≤ 5 s the clock is hot (accent digits, faster sweep, edge throb, `sfx.ping()` each second). At 0, `TIME!` stamps on the card, it shakes, `sfx.timeout()`, the mascot looks sad, the square turns miss, then the next Prompt (no catch screen, no descent).

## 7. Reveal (`/runs/[id]/reveal`)

The camera starts at your **final depth**; the results are a centred column (max ~560 px) that **scrolls over the sea** (Krillion's results image). Scrolling to the top shows the dusk sky, the waterline and the boat in silhouette above the column; menu, mute and settings tiles sit top right; the mascot sits top right of the column. Built by `DiveReveal` from the results blocks, in this order:

1. **Header row:** small `Logo` left, `DIVE #N COMPLETE` right-aligned (N = this Player's dive count on this Game; the Daily uses its day number).
2. **ResultHeader:** the score counting up big (VT323 ~96 px), the depth beside it in signal (`−1,400m`), and a `★ NEW PERSONAL BEST` banner when it applies.
3. **DistributionChart:** a smooth curve over 0–700 with `YOU` marked in accent.
   - Module Games (private): the curve of **your own past Run scores** on this Game, plus your Personal Best marked; caption `BETTER THAN 6 OF YOUR 9 DIVES`.
   - Public Games (Daily Dive, Course Topics): **today's players**, from the TimescaleDB daily results aggregate (`approx_percentile`); caption `BETTER THAN 62% OF TODAY'S PLAYERS`.
   - Fewer than 3 data points: skip the curve, show the caption only.
4. **DiveLogChart**, labelled `DIVE LOG · deeper = rarer`: x = Prompt 1–7, y = metres going down (gridlines every 25 points/250 m). Each scored Prompt is a dropline from the surface to its tier depth ending in that tier's creature icon; misses are a dim bubble at the surface.
5. **Mastery:** `31% → 34%` with the new `Meter` segments playing `gild`.
6. **BandTable**, labelled `THE BEARING` (the Player's row is lit):

   | Run total | Band | Verdict |
   |---|---|---|
   | 0–150 | Shallows | Plenty of ocean left below. |
   | 151–300 | Reef | You know the main ideas. |
   | 301–500 | Abyss | Below the slides' surface. |
   | 501–700 | Trench | You read the footnotes. |
7. **ResultList**, labelled `THE CATCH · tap a prompt for every answer`. The first row starts expanded. For an Open Prompt:
   - the filter chips `ALL 11 · TRENCH 1 · ABYSS 3 · REEF 4 · SHALLOWS 3`
   - a search box
   - every Answer, rarest first: `✓ yours` on the found one, `+60` in its band colour, and the `EvidenceLine` (links into the Module's file viewer with `?doc=&page=`).
   Public Games add a per-Answer crowd line (`found by 12% of players`).
8. **Buttons:** `▼ DIVE AGAIN ▼` (primary) and `BACK`.

## 8. Components (`components/modes/dive/`)

| File | What |
|---|---|
| `tiers.ts` | `TIER_UI` (label, band var, icon, sink depth, verdicts) |
| `depth.ts` | metres per point, `formatDepth`, zone table and colour blending |
| `OceanStage.tsx` | the depth-world canvas: camera, zones, rays, marine snow, creatures, boat, waterline, bubbles; imperative `setDepth(metres)` |
| `DepthRuler.tsx` | right-edge ruler + `YOU ◀` marker, scrolled by the camera depth |
| `DiveHud.tsx` | the three-plate HUD row (`HudPlate`, `ProgressSquares` from `components/round/`) |
| `TierLines.tsx` | the four dashed tier lines; its `sink` prop drops the sinking `ResultChip` (line flashes, `onLanded`) |
| `CatchScreen.tsx` | the catch screen with `DESCEND ▼`, Enter and the ~6 s auto-continue |
| `DiveLogChart.tsx` | the dive log droplines |
| `DiveReveal.tsx` | the Reveal column (§7) |
| `DivePlayground.tsx` | a fake 7-Prompt Dive, client-side, for `/styleguide` |

Shared blocks it uses: `components/round/` (`HudPlate`, `ProgressSquares`, `RoundCard`, `SonarTimer`, `Fuse`, `TypedInput`, `OptionGrid`, `OrderList`, `HintButton`, `ResultChip`) and `components/results/` (`ResultHeader`, `DistributionChart`, `BandTable`, `ResultList`, `EvidenceLine`).

## 9. Open

- Should the Bearing bands scale to the Game's real maximum score instead of the fixed 700?
- Auto-continue after ~6 s: keep, or only when the tab is focused? (Default: only counts down while the page is visible.)
