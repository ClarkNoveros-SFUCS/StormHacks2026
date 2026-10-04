# Apogee: Dive in space

**Stub (F20).** Rules and words only; the visual spec (three.js rocket launch, a port of `inspo/krillion-space-variant/apogee.html`) is written by the UI lane (F24). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` §4, Q21.

## Rules

Exactly Dive's (`docs/architecture/run-and-scoring.md` § Dive and Apogee): 7 Prompts, 25 s each, −3 s per wrong typed guess, one try for put-in-order and odd-one-out, Hints drop a Tier, Staleness on Open Prompts. Same generator, same Prompts kinds, same points. `RunState.mode` is `"apogee"`; everything else in the state, results and Reveal is Dive's shape (`DiveRunState`, `DiveReveal`).

**Pass bar:** score ≥ 150.

## Words

| Thing | Word |
|---|---|
| Play button | **LAUNCH** |
| Score | altitude in **km** (1 point = 1 km, so the max 700 points = 700 km) |
| Tiers (common → rare) | **Troposphere** (10) · **Orbit** (25) · **Lunar** (60) · **Deep Space** (100) (`MODES.apogee.bands`) |
| Results screen title | **MISSION REPORT** |
| A wrong guess | "Off course −3 s" |
| Timeout | "Lost signal" |
| Mascot | a pixel rocket |
| Accent | `#9d7bff` (violet), from `MODES.apogee.accent` |

**CHECK:** km per point is a guess (Dive uses 10 m per point); the UI lane may scale it for drama, as long as the number shown stays proportional to the score.
