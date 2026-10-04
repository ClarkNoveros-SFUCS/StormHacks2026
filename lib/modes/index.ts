// The one list of Game Modes (ADR-0004, docs/architecture/game-modes.md). Used to validate
// `mode` on Game creation and to render the New Game dialog. Keep it in step with the
// games.mode CHECK constraint.
export const MODES = {
  dive: { id: "dive", name: "Dive", available: true },
} as const;

export type ModeId = keyof typeof MODES;

export function isModeId(value: unknown): value is ModeId {
  return typeof value === "string" && Object.hasOwn(MODES, value) && MODES[value as ModeId].available;
}
