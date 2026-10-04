# Dive: the Krillion-style Game Mode

The first Game Mode. A Run is 7 Prompts at 25 s each, and less obvious correct Answers score more. The score is shown as **depth**: every point sinks you 10 metres. Rules and scoring: `docs/architecture/run-and-scoring.md` and `game-generation-pipeline.md`. Everything not listed here (tokens, recipes, motion, the round and results building blocks) comes from [`../design-system.md`](../design-system.md).

**Mock:** `docs/design/mock/modes/dive/`. Play a Run at `mock/index.html#run`, and try:
- `kruskal`
- `floyd warshal` (a typo that still matches)
- `hopcroft karp` (a Trench Answer)
- a wrong guess (−3 s)
- the Hint button
- dragging to reorder, and odd-one-out

## 1. Reference: Krillion

Studied 2026-10-03 from krillion.io's start screen, results screen, menu and stylesheet.

| We copy | We make our own |
|---|---|
| The ocean world: pixel sky → waterline → dark sea, plus the boat on the surface | The mascot (pixel anglerfish, not a krill) |
| The HUD: depth on the left (cyan), progress dots, score on the right (pink); the bottom dock with a sonar-style clock, fuse, input and DIVE button | Tier names and icons (§3) |
| Dashed tier lines in the water and the glowing answer chip that sinks past them | All wording |
| The results column: big score, chart, depth-band verdicts ("The Bearing"), and the per-round list with tier filters and search ("The Catch") | No crowd stats: comparison with your own past Runs instead (§6) |
| Score as depth: 10 m per point, 700 points = the trench | |

## 2. Dive theme

`[data-theme="dive"]` keeps the house palette (§4 of the design system) and adds:

| Token | Value | Use |
|---|---|---|
| `--band-1` | `#8fa3c4` | Shallows (common) |
| `--band-2` | `#4de3ff` | Reef (solid) |
| `--band-3` | `#9d7bff` | Abyss (deep) |
| `--band-4` | `#ffd166` | Trench (rare) |
| `--band-miss` | `#3d4f6e` | timeout, one-try miss |

- **Scene: the ocean** (shared with the house theme). Cameras:
  - `surface`: the Game page. Waterline at 55%, daylight sky, boat.
  - `descent`: the Run. The waterline slides up out of view over ~900 ms. The sea darkens as depth grows: `#1d4a73 → #05080f` across 0 → 4,000 m, with marine snow.
  - `deep`: the Reveal. A dusk sky, the waterline at 55%, the boat in silhouette.
- **Score metaphor:** `formatScore(points) = −(points × 10) m`, e.g. `−1,240 m`. A Run maxes out at 700 points, which is −7,000 m.
- **Mascot:** the pixel anglerfish with a gold lantern (`glow-pulse`):
  - It sits left of the play area during a Run and top right on the Reveal.
  - It plays `chomp` on a correct answer and `sad` on a miss, and blows a bubble every 3–6 s.
- **Particles:** bubbles, drawn as 2–4 px pixel squares.
- **Sound voice:**
  - `correct(band)` is a two-note blip pitched up by band. Trench adds a sparkle.
  - `wrong` is a low thud.
  - `ping` is a sonar ping.
  - `timeout` is a descending buzz.
- **Words:**
  - The Play button says `▼ BEGIN DESCENT ▼`, and play-again says `▼ DIVE AGAIN ▼`.
  - Runs are called "dives" in copy. The domain term stays Run.
  - The submit button says `DIVE ▼`.

## 3. Tiers on screen

| Tier (code) | Display | Points | Depth | Band | Icon |
|---|---|---|---|---|---|
| common | **Shallows** | 10 | 100 m | `--band-1` | bubble |
| solid | **Reef** | 25 | 250 m | `--band-2` | small fish |
| deep | **Abyss** | 60 | 600 m | `--band-3` | jellyfish |
| rare | **Trench** | 100 | 1,000 m | `--band-4` | lantern |
| miss | Miss | 0 | — | `--band-miss` | dim bubble |

- A hinted Prompt shows its dropped tier and a caution `HINT` tag. A hinted common Prompt is worth 5.
- An Answer reduced by Staleness shows the reduced points and a muted `REPEAT ÷2` tag.
- Code: `components/modes/dive/tiers.ts` exports `TIER_UI: Record<Tier, { label, band, icon, depth }>`.

## 4. Game page stats (`/games/[id]`, `surface` camera)

The shell draws the frame (title, file chips, `ModeBadge`, recent Runs). Dive fills the stats row with three Panels:
- `PERSONAL BEST −1,200 M` in reward
- `MASTERY 31%` with a `Meter`
- `FOUND`: per-tier icon rows like `SHALLOWS 9/11`

Its Play button is `▼ BEGIN DESCENT ▼`. Pressing it unlocks audio, creates the Run, switches the camera to `descent`, and routes to the Run.

## 5. Run (`/runs/[id]`, `descent` camera)

```
 DEPTH −1,240 m        ■ ■ ■ ◆ □ □ □          SCORE 124      ← RoundHud (left: depth in signal, right: score in accent)
                         PROMPT 4/7
 ┌───────────────────────────────────────────────────┐
 │ PROMPT 04 · OPEN                                  │       ← RoundCard (single-answer kinds show their tier badge on the right)
 │ Name a graph algorithm                            │
 │ NAME ANY · RARER SINKS DEEPER                     │
 └───────────────────────────────────────────────────┘
   - - - - - - - - - - - - - - - - - - - ◌ SHALLOWS 100 M      ← play area: <TierLines>
   - - - - - - - - - - - - - - - - - - - ≻ REEF 250 M
              [ KRUSKAL ▼ ] +25                                ← ResultChip, sinking
   - - - - - - - - - - - - - - - - - - - ⌘ ABYSS 600 M
   - - - - - - - - - - - - - - - - - - - ✦ TRENCH 1,000 M
 ════════════════════════════════════════════════════════
  (◔) 18   > dijkstra_                         [ DIVE ▼ ]     ← bottom bar: RoundTimer (sonar skin), TypedInput, button
           ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  fuse                [? HINT]
```

- **`<TierLines>`** (Dive's play area): dashed lines at 16%, 40%, 66% and 90% of the play area's height, each tagged with icon, name and depth on the right.
  - Single-answer Prompts: the line the Prompt will score on is marked `THIS PROMPT ▸`, and the others dim. Using the Hint moves the mark up one line.
  - Put-in-order: the `OrderList` sits over the lines until `LOCK IN ▼` is pressed.
- **Correct:**
  - The `ResultChip` appears under the card and **sinks** on a spring (stiffness 120, damping 14), so it overshoots and bobs back to sit on its tier line.
  - Each line it passes plays `line-flash` in that line's band colour.
  - On landing it shows `+25`, the score slams, the depth counts up on a spring with `crank-jolt`, and the dot turns reward.
  - The mascot chomps. 8 bubbles rise; a Trench answer releases 24 gold bubbles, plays the stage flash and shows a `gold-pulse` chip.
  - After ~1.5 s the card plays `card-gone` and the next Prompt enters.
- **Wrong typed guess:**
  - The input plays `reject-jolt`.
  - `−3s` floats up from the clock, and the fuse cuts 3 s.
  - The correction line reads `<guess> · not in your notes`. Never say "wrong": it may be an Off-syllabus guess.
- **One-try miss** (put-in-order, odd-one-out): the card shakes, the right option lights, the correction line says `One try · it was Dijkstra`, and the dot turns miss.
- **Timeout:** at ≤ 5 s the clock is hot (accent digits, faster sweep, edge throb, a ping each second). At 0, `TIME!` stamps on the card, it shakes, and the mascot looks sad.
- **Between Prompts:** the sea keeps darkening toward the new total depth.

## 6. Reveal (`/runs/[id]/reveal`, `deep` camera)

The results building blocks, in this order:

1. **ResultHeader**: `DIVE COMPLETE · GRAPHS MIDTERM`, the score counting up, the depth beside it in signal, and a `★ NEW PERSONAL BEST` banner when it applies.
2. **ProgressChart**, labelled `DIVE LOG · deeper = rarer`. The y axis is metres going down, with a gridline every 250 m. Your last 3 dives are ghost lines and your Personal Best is the dashed line. This replaces Krillion's chart comparing you with other players.
3. **Mastery**: `31% → 34%`, with the new `Meter` segments playing `gild`.
4. **BandTable**, labelled `THE BEARING`:

   | Run total | Band | Verdict |
   |---|---|---|
   | 0–150 | Shallows | Plenty of ocean left below |
   | 151–300 | Reef | You know the main ideas |
   | 301–500 | Abyss | Below the slides' surface |
   | 501–700 | Trench | You read the footnotes |
5. **ResultList**, labelled `THE CATCH · tap a prompt for every answer`. The first row starts expanded. For an Open Prompt, it shows:
   - the filter chips `ALL 11 · TRENCH 1 · ABYSS 3 · REEF 4 · SHALLOWS 3`
   - a search box
   - every Answer, rarest first: `✓ yours` on the found one, `+60` in its band colour, and the Evidence line
6. **Buttons**: `▼ DIVE AGAIN ▼` (primary) and `BACK TO GAME`.

## 7. Open

- Should the Bearing bands scale to the Game's real maximum score instead of the fixed 700?
