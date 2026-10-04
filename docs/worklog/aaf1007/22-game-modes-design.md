# #22 Plan Game Modes and the shared design system (F10 spec)

Status: done
Branch: feat/22-game-modes-design
Updated: 2026-10-04 00:45

## Goal
Plan Game Modes (only Dive for now, more later) and turn the Krillion-style design into a shared design system plus one spec per Mode. Specs: `docs/architecture/game-modes.md`, `docs/design/design-system.md`, `docs/design/modes/dive.md`.

## Done so far
- Krillion studied from the live site (start screen, results, per-round answer list, menu, stylesheet: colours, easings, keyframes, class names of the in-game HUD/dock). The daily dive wasn't played, so the in-game screen was rebuilt from the stylesheet.
- Decisions with Anton: the term is Game Mode, and Dive is the first one. Each Game has exactly one Mode; similar Modes may share parts. Each Mode has its own theme. The Mode picker goes in the New Game dialog, with a locked "More modes soon" tile.
- `CONTEXT.md` (Game Mode, Dive; Run/Prompt made Mode-neutral; scoring marked Dive), ADR-0004, `game-modes.md`, notes in overview/data-model/ui-map and the Dive specs.
- Design split: `design-system.md` (shared feel, theme contract, round/results building blocks) and `modes/dive.md`. The mock in `docs/design/mock/` is split into core/themes/modes/app and checked in a browser: Mode picker, theme switch house → dive, Run (typo match, −3 s, hint, order, odd-one-out) and Reveal.
- Issue #21 (F13) created for the code: `games.mode` migration, `lib/modes`, API field, Mode picker.

## Next steps
None for this issue. F10 implements `design-system.md`; F09 implements `modes/dive.md`; #21 implements the Mode seam.

## Decisions & gotchas
- The shell (landing, Modules, Module page) uses the house theme, which is the ocean surface. Mode themes apply on the Game page, Run and Reveal.
- Components use only semantic tokens (`--accent`, `--signal`, `--reward`, `--band-1…4`, …). A theme overrides them under `[data-theme=<mode>]`.
- Name SYLLABYSS and the anglerfish mascot are working placeholders.
- The mock is reference code: port it, don't import it. In a background browser tab, rAF is paused, so animations only advance when the tab is visible.

## Files touched
- CONTEXT.md, docs/FEATURES.md (F09/F10 spec lines, F13 row + section)
- docs/adr/0004-one-game-mode-per-game.md
- docs/architecture/game-modes.md, overview.md, data-model.md, ui-map.md, game-generation-pipeline.md, run-and-scoring.md
- docs/design/design-system.md, docs/design/modes/dive.md, docs/design/mock/**
