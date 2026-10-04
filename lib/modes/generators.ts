// The generator for each Game Mode. Apogee uses Dive's; Arena uses Leap's (multiple_choice).
// Pure: relative .ts imports only.
import { arenaGenerator } from "./arena/generate.ts";
import { blitzGenerator } from "./blitz/generate.ts";
import { diveGenerator } from "./dive/generate.ts";
import type { ModeGenerator } from "./generation.ts";
import { MODES, type ModeId } from "./index.ts";
import { leapGenerator } from "./leap/generate.ts";
import { pairsGenerator } from "./pairs/generate.ts";

const BY_ENGINE: Record<(typeof MODES)[ModeId]["engine"], ModeGenerator> = {
  dive: diveGenerator,
  leap: leapGenerator,
  pairs: pairsGenerator,
  blitz: blitzGenerator,
  arena: arenaGenerator,
};

/** The Mode's generator, or null for an unknown or not-yet-available Mode. */
export function generatorFor(mode: string): ModeGenerator | null {
  if (!Object.hasOwn(MODES, mode)) return null;
  const info = MODES[mode as ModeId];
  return info.available ? BY_ENGINE[info.engine] : null;
}
