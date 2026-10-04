// Sonar (F32): the Root cause of a Player's recent misses. Pure, client-safe.
// Spec: docs/architecture/sonar.md § Learner model (Root cause).

import { descendants, type Edge } from "./graph";
import { RECENT_MISSES, type Miss } from "./model";
import type { ConceptState, RootCause } from "./types";

export const ROOT_CAUSE_SHARE = 0.4;

/**
 * Over the last 10 misses, sums each Concept's blame. A Root cause is weak or learning, is a
 * (direct or indirect) prerequisite of a Concept the misses were on (a miss's primary Concept),
 * and holds ≥ 40 % of the blame. The highest share wins; null when none qualifies.
 */
export function diagnose(concepts: readonly ConceptState[], misses: readonly Miss[], edges: readonly Edge[]): RootCause | null {
  const recent = misses.slice(-RECENT_MISSES);
  if (recent.length === 0) return null;
  const blame = new Map<string, number>();
  const count = new Map<string, number>();
  for (const m of recent) {
    for (const [id, b] of Object.entries(m.blame)) {
      blame.set(id, (blame.get(id) ?? 0) + b);
      if (b > 0) count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  const missedOn = [...new Set(recent.map((m) => m.on))];

  let best: RootCause | null = null;
  for (const c of concepts) {
    if (c.status !== "weak" && c.status !== "learning") continue;
    const share = (blame.get(c.id) ?? 0) / recent.length;
    if (share < ROOT_CAUSE_SHARE) continue;
    const below = descendants(c.id, edges);
    const on = missedOn.filter((id) => below.has(id));
    if (on.length === 0) continue;
    if (!best || share > best.blameShare) best = { conceptId: c.id, blameShare: share, missedOn: on, misses: count.get(c.id) ?? 0 };
  }
  return best;
}
