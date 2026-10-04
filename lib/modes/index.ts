// The one list of Game Modes (ADR-0004, docs/architecture/game-modes.md). Used to validate
// `mode` on Game creation, to pick each Mode's generator and run engine, and to render the
// New Game dialog. Keep it in step with the games.mode CHECK constraint.
//
// Pure data, client-safe, and loadable by plain Node (scripts/generate-check.ts).

/** Every kind of Prompt a Game can hold (prompts.kind). */
export type PromptKind =
  | "open"
  | "cloze"
  | "definition_to_term"
  | "ordered_recall"
  | "odd_one_out"
  | "multiple_choice" //  Leap (and Arena later): stem, 4 options, exactly 1 correct
  | "true_false"; //      Blitz: a statement that is true or false

const DIVE_KINDS = ["open", "cloze", "definition_to_term", "ordered_recall", "odd_one_out"] as const satisfies readonly PromptKind[];

export type ModeInfo = {
  id: string;
  name: string;
  /** One line for the Mode tile. */
  tagline: string;
  /** The rules in one line, for the New Game dialog. */
  rules: string;
  /** The Prompt kinds its Games are generated with. */
  kinds: readonly PromptKind[];
  /** False: listed (locked tile) but can't be created yet. */
  available: boolean;
  /** Suggested accent colour for its tile and badge (the Mode's theme owns the rest). */
  accent: string;
  /** The verb on its play button. */
  playVerb: string;
  /** Which run engine and generator it uses. Apogee plays and generates exactly like Dive. */
  engine: "dive" | "leap" | "pairs" | "blitz";
  /** The fewest Prompts a Game needs; generation fails below this. */
  minPrompts: number;
  /** Dive-family only: names for the four Tiers (common, solid, deep, rare), for the UI. */
  bands?: readonly [string, string, string, string];
};

export const MODES = {
  dive: {
    id: "dive",
    name: "Dive",
    tagline: "Rarer answers sink deeper.",
    rules: "7 prompts, 25 s each. Type answers; obscure ones score more.",
    kinds: DIVE_KINDS,
    available: true,
    accent: "#4de3ff",
    playVerb: "DIVE",
    engine: "dive",
    minPrompts: 7,
    bands: ["Shallows", "Reef", "Abyss", "Trench"],
  },
  apogee: {
    id: "apogee",
    name: "Apogee",
    tagline: "Rarer answers fly higher.",
    rules: "Dive's rules in space: 7 prompts, 25 s each, obscure answers climb higher.",
    kinds: DIVE_KINDS,
    available: true,
    accent: "#9d7bff",
    playVerb: "LAUNCH",
    engine: "dive",
    minPrompts: 7,
    bands: ["Troposphere", "Orbit", "Lunar", "Deep Space"],
  },
  leap: {
    id: "leap",
    name: "Leap",
    tagline: "Answer right to jump to the next platform.",
    rules: "10 multiple-choice questions, 15 s each, 3 hearts, one 50/50.",
    kinds: ["multiple_choice"],
    available: true,
    accent: "#3ddc97",
    playVerb: "JUMP",
    engine: "leap",
    minPrompts: 10,
  },
  pairs: {
    id: "pairs",
    name: "Pairs",
    tagline: "Match every term to its definition.",
    rules: "2 boards of 6 pairs, 60 s each. Mismatches cost time.",
    kinds: ["definition_to_term"],
    available: true,
    accent: "#ffd166",
    playVerb: "MATCH",
    engine: "pairs",
    minPrompts: 12,
  },
  blitz: {
    id: "blitz",
    name: "Blitz",
    tagline: "True or false, as fast as you can.",
    rules: "60 s of true/false. Streaks of 5 double your points; misses cost 3 s.",
    kinds: ["true_false"],
    available: true,
    accent: "#ff5d8f",
    playVerb: "GO",
    engine: "blitz",
    minPrompts: 30,
  },
  // Reserved (games.mode CHECK allows it): a three.js FPS that reuses multiple_choice. Not built.
  arena: {
    id: "arena",
    name: "Arena",
    tagline: "Shoot the right answer.",
    rules: "Coming soon.",
    kinds: ["multiple_choice"],
    available: false,
    accent: "#ff9f43",
    playVerb: "FIGHT",
    engine: "leap",
    minPrompts: 10,
  },
} as const satisfies Record<string, ModeInfo>;

export type ModeId = keyof typeof MODES;
/** Modes that can be created and played today. */
export type AvailableModeId = { [K in ModeId]: (typeof MODES)[K]["available"] extends true ? K : never }[ModeId];
/** Modes that play by Dive's rules and generator. */
export type DiveFamilyModeId = "dive" | "apogee";

export const MODE_IDS = Object.keys(MODES) as ModeId[];

/** True for a Mode that can be created now (not a reserved one like Arena). */
export function isModeId(value: unknown): value is AvailableModeId {
  return typeof value === "string" && Object.hasOwn(MODES, value) && MODES[value as ModeId].available;
}

export function isDiveFamily(mode: ModeId): mode is DiveFamilyModeId {
  return MODES[mode].engine === "dive";
}
