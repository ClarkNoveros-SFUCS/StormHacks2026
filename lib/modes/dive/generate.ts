// Dive's generator (Apogee uses it unchanged). The instructions and schema stay in
// lib/gemini/game-prompt.ts and the checks in lib/games/validate.ts, where the generation
// quality work (F14–F17) tunes them; this file plugs them into the per-Mode pipeline.
// Pure: relative .ts imports only (scripts/generate-check.ts loads it with Node).

import {
  GAME_OVERGENERATE_SYSTEM_INSTRUCTION, GAME_PROMPT_TEMPERATURE, GAME_RESPONSE_SCHEMA, GAME_SYSTEM_INSTRUCTION,
  gameOvergenerateContents, gamePromptContents,
} from "../../gemini/game-prompt.ts";
import { selectPrompts } from "../../games/select.ts";
import { validateDocument } from "../../games/validate.ts";
import { keepAll, NOT_ENOUGH_CONTENT, type ModeGenerator } from "../generation.ts";
import { MODES } from "../index.ts";

export const diveRequest = {
  systemInstruction: GAME_SYSTEM_INSTRUCTION,
  responseSchema: GAME_RESPONSE_SCHEMA,
  temperature: GAME_PROMPT_TEMPERATURE,
  contents: gamePromptContents,
};

/** F17: ask for about 25 Prompts; selectPrompts keeps the best 15-20 per document. */
export const diveOvergenerateRequest = { ...diveRequest, systemInstruction: GAME_OVERGENERATE_SYSTEM_INSTRUCTION, contents: gameOvergenerateContents };

export const diveGenerator: ModeGenerator = {
  request: diveRequest,
  minPrompts: MODES.dive.minPrompts,
  validate(response, pages) {
    const result = validateDocument(response, pages);
    return { ...result, prompts: result.prompts.map((p) => ({ ...p, isTrue: null })) };
  },
  finalize: keepAll,
  notEnough: () => NOT_ENOUGH_CONTENT,
  overgenerate: {
    request: diveOvergenerateRequest,
    select: (prompts, verification) => selectPrompts(prompts, { verification }),
  },
};
