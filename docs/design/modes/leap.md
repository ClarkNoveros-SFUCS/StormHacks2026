# Leap: jump to the next platform

**Stub (F20).** Rules and words only; the visual spec (three.js voxel/pixel hopper on floating sky-island platforms rising upward, parallax clouds) is written by the UI lane (F24). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q18.

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
