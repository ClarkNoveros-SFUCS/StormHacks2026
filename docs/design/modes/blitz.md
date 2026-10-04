# Blitz: true or false, fast

**Stub (F20).** Rules and words only; the visual spec (neon arcade, a beat-synced pulse) is written by the UI lane (F25). Decisions: `docs/worklog/aaf1007/overnight-decisions.md` Q20.

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
| Play button | **GO** |
| Correct | `+10` / `+20` |
| Wrong | "Nope −3 s" (and briefly show the truth: "It's TRUE") |
| Combo | "COMBO ×2" from 5 in a row |
| Time up | **TIME!** (outcome `time_up`) |
| Deck finished early | **DECK CLEARED** (outcome `deck_cleared`) |
| Results screen title | **REPLAY** (every statement shown, with its truth, explanation and Evidence) |
| Accent | `#ff5d8f` (pink), from `MODES.blitz.accent` |

The pulse respects `prefers-reduced-motion`; the clock is announced every 10 s and in the last 5 s through `aria-live`.
