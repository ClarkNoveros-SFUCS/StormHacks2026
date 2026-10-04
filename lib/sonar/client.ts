// Sonar (F32): open the Sonar drawer from anywhere in the client ("Ask Sonar" links, bubbles).
// The drawer (components/sonar/SonarBuddy.tsx) listens for this event.

import type { GameSummary } from "@/lib/games/types";

export const SONAR_OPEN_EVENT = "sonar:open";

export type SonarOpenDetail = {
  /** Sent as the Player's first message. Omitted: Sonar gives its briefing for the page. */
  message?: string;
};

export function openSonar(detail: SonarOpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<SonarOpenDetail>(SONAR_OPEN_EVENT, { detail }));
}

// A Game made from Sonar's "Make this Game" card. The Module page (ModuleWorkspace) listens and
// adds it to its Games panel as Generating, then polls until it's Ready.
export const SONAR_GAME_CREATED_EVENT = "sonar:game-created";

export type SonarGameCreatedDetail = { game: GameSummary };

/** Cards already pressed this session (by action), so a card remounted after the drawer reopens still says Generating. */
const made = new Map<string, string>();
export const createdGameFor = (key: string) => made.get(key);

export function announceGameCreated(key: string, game: GameSummary) {
  made.set(key, game.id);
  window.dispatchEvent(new CustomEvent<SonarGameCreatedDetail>(SONAR_GAME_CREATED_EVENT, { detail: { game } }));
}
