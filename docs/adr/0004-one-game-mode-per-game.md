# One Game Mode per Game, and each Mode brings its own theme

Players will be able to choose between several kinds of game; for now there's one, **Dive** (Krillion-style). **Every Game has exactly one Game Mode, chosen in the New Game dialog and never changed.** The Mode decides:
- which Prompt kinds Gemini generates
- the Run rules and scoring
- the Run and Reveal screens
- the visual theme

Modes may share Prompt kinds, answer matching and UI building blocks. The app shell (landing, Modules, Module page) has one house theme. Each Mode's theme takes over on its Game page, Run and Reveal.

## Considered options

- **One set of Prompts playable in any Mode:** rejected. Each Mode would be limited to content that suits every Mode; Dive needs Open Prompts with Rarity and Tiers that, say, a flashcard Mode doesn't. Personal Best and Mastery would also have to be tracked per Game *and* Mode.
- **All Modes share one theme:** rejected. The team wants Modes free to look different. What they share is the design system's feel (pixel type, pixel geometry, CRT stage, motion, round and results skeletons), not the palette or scene.

## Consequences

- `games.mode` (text, default `'dive'`) is a new column. Generation, the Run engine and the UI look up the Game's Mode to decide what to do.
- Adding a Mode means adding:
  - a generator prompt and schema
  - Run rules
  - a theme and screens

  The existing tables, matching and shared components don't change.
- Today's generation and Run code is Dive's. It stays where it is until a second Mode exists, at which point the parts that differ move behind the Mode (`docs/architecture/game-modes.md`).
- Progress (Personal Best, Mastery) stays per Game, which already means per Mode.
