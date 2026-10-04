// Sonar (F32): open the Sonar drawer from anywhere in the client ("Ask Sonar" links, bubbles).
// The drawer (components/sonar/SonarBuddy.tsx) listens for this event.

export const SONAR_OPEN_EVENT = "sonar:open";

export type SonarOpenDetail = {
  /** Sent as the Player's first message. Omitted: Sonar gives its briefing for the page. */
  message?: string;
};

export function openSonar(detail: SonarOpenDetail = {}) {
  window.dispatchEvent(new CustomEvent<SonarOpenDetail>(SONAR_OPEN_EVENT, { detail }));
}
