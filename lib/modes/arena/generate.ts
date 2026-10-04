// Arena's generator: Leap's multiple-choice questions (same Gemini prompt, schema and checks),
// with Arena's name in the "not enough questions" message. Spec: game-generation-pipeline.md § Leap.
// Pure: relative .ts imports only (scripts/generate-check.ts loads it with Node).
import { notEnoughFor, type ModeGenerator } from "../generation.ts";
import { MODES } from "../index.ts";
import { leapGenerator } from "../leap/generate.ts";

export const arenaGenerator: ModeGenerator = {
  ...leapGenerator,
  minPrompts: MODES.arena.minPrompts,
  notEnough: notEnoughFor("Arena", "questions", MODES.arena.minPrompts),
};
