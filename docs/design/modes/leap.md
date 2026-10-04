# Leap: jump to the next platform

Rules and words from F20; the look and the screens from F24 (`components/modes/leap/`, three.js). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q18.

## Rules (`docs/architecture/run-and-scoring.md` § Leap)

- 10 multiple-choice questions, 15 s each, **one answer** each. Options are lettered A–D (keys 1–4 or A–D).
- Correct: the hopper **jumps** to the next platform. Points = (100 + speed bonus up to 50) × streak multiplier (×1.5 at 3 in a row, ×2 at 5+). Show the multiplier before answering (`state.nextMultiplier`).
- Wrong or out of time: the platform **crumbles** and a **Heart** is lost. 3 Hearts; at 0 the hopper **falls** and the Run ends.
- **50/50** once per Run: two wrong options fade out (`hiddenOptionIds`), and that question's points are halved (say so on the button: "50/50 · half points").
- The question appears only after `start-prompt` (show a "Ready? JUMP" beat between questions); after each answer the result names the correct option and gives a one-line explanation.

**Pass bar:** at least 7 of 10 correct without falling.

## Words

| Thing | Word |
|---|---|
| Play button | **JUMP** |
| Correct | "Nice leap!" + points, e.g. `+188 · ×1.5` |
| Wrong | "The platform crumbles" |
| Timeout | "Too slow, it crumbles" |
| Run ends at 0 Hearts | **YOU FELL** (outcome `fell`) |
| Run ends after 10 | **SUMMIT** (outcome `cleared`) |
| Results screen title | **CLIMB REPORT** |
| Lifeline | **50/50** |
| Streak | "3 in a row · ×1.5", "5 in a row · ×2" |
| Accent | `#3ddc97` (green), from `MODES.leap.accent` |

Hearts are never colour-only: show them as icons with a count for screen readers ("2 of 3 hearts left").

## Look (F24)

Bright sky islands. Theme `[data-theme="leap"]` (`components/modes/leap/leap.css`, scoped `.lp-root`): chunky rounded cards (`.lp-card`: dark translucent navy, 2 px light border, 16 px radius, a hard 6 px drop), pressable pixel buttons (`.lp-btn`, green primary with a dark-green drop that squashes on press), Pixelify Sans for headings and buttons, VT323 for HUD numbers, Mulish for questions and options. Accent `#3ddc97`, reward `#ffd84d`, hearts `#ff4f7b`.

## The world (`scene.ts`, three.js)

- **Islands:** one per question plus the start, zig-zagging upward (2.5 units apart, alternating left/right). Each is voxel-built: a grass slab with a darker lip, a dirt layer, a hanging rock of stacked shrinking stone slabs, dangling vines, flowers, and a voxel tree on every third. The summit island is snow-topped with a **flag** whose cloth waves. Islands bob gently. A pulsing green diamond marks the island the current question lands on.
- **The hopper:** a voxel creature (yellow body, cream belly, orange ears and feet, blinking eyes, pink cheeks) with a blob shadow. Correct: anticipation squash → stretch → an arc to the next island → land squash with a spring and a dust puff. Wrong or timeout: the target island **crumbles** into falling voxel chunks, the hopper hops out, finds nothing, and wobbles back. At 0 Hearts it leaps for the crumbling island and **falls** tumbling out of view.
- **Sky:** a gradient dome that moves from morning blue to golden hour to dusk to night (stars fade in) as you climb. **Parallax clouds:** three layers of chunky pixel clouds (near and faint, mid, far) drifting at different speeds, plus distant voxel islands in the haze. The camera follows the hopper up with a spring and leans a little toward the cursor.
- **Framing:** the screen tells the scene where the open sky is (between the HUD and the question card) and the camera renders an offset window so the hopper always sits there, on phones and desktops alike.

## Run screen (`LeapRunScreen.tsx`)

- **HUD:** menu tile and LEAP + Game title (left); `Q 3 / 10` with ten squares (green right, red miss, yellow outline now) (centre); three pixel hearts (a lost one breaks: pop, tilt, grey) and the score (right); a flame **streak chip** (`3 in a row · ×1.5`) and `next ×1.5 · ×2 in 2` under it.
- **Intro** (a fresh Run): "Jump to the summit", the rules, chips (♥ ×3, the multipliers, one 50/50), **JUMP ▲** (Enter). Between questions: **READY? JUMP ▲** sits in the result card (Enter); the question only appears after start-prompt.
- **Question card:** `QUESTION 3 / 10`, the 15 s countdown (red under 5 s) and a green→yellow time bar, the question, four lettered options (A–D, keys 1–4 or A–D; two columns from 480 px), and **50/50 · half points** (key 5) which fades two wrong options out; after use it reads "50/50 used".
- **Result:** the right option glows green ✓, your wrong pick shakes red ✗; "Nice leap! +188 · ×1.5" (and `+188` pops over the hopper) or "The platform crumbles" / "Too slow, it crumbles", then the explanation.
- **End:** **SUMMIT!** (flag raised, confetti voxels) or **YOU FELL**, then the Climb Report.

## Climb Report (`LeapRevealScreen.tsx`)

The tower stays behind the column (the hopper replays its ending: the flag goes up, or it leaps and falls). Contents: `CLIMB REPORT · CLIMB #N`, the score with `▲ SUMMIT` / `▼ FELL AT Q6`, NEW PERSONAL BEST, Topic passed banner (Course Games), stats (correct x/10, best streak, hearts left, 50/50 used/saved), **▲ PLAY AGAIN** / Back to Game, the distribution of your climbs (0–2,550), the **CLIMB LOG** (one bar per question, height by points), Mastery, and **EVERY QUESTION**: each row expands to all four options (yours ✗, the right one ✓, the ones the 50/50 removed struck through), the explanation and the Evidence line linking into the Module's file viewer (`/modules/[moduleId]?doc=&page=`).

## Motion and performance

Same contract as Apogee: dynamic import of three.js, device pixel ratio capped at 2, paused while hidden, everything disposed on unmount. Reduced motion: no squash/stretch, bob, wobble, cloud drift, cursor lean or dust; the camera eases straight to each island; CSS animations off.
