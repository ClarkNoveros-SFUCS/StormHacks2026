// Sonar (F32): where the Player is, worked out from the URL alone, so no page has to pass it in.
// Pure and client-safe.

import type { PageContext } from "./types";

/** Sonar never runs during a Run ("AI never during a Run"): the buddy hides on /runs/[runId]. */
export function isRunScreen(path: string): boolean {
  return /^\/runs\/[^/]+\/?$/.test(path) || path.startsWith("/runs/new");
}

export function contextFromPath(path: string): PageContext {
  const p = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  let m: RegExpMatchArray | null;
  if ((m = p.match(/^\/explore\/([^/]+)\/([^/]+)$/))) return { kind: "topic", path: p, courseSlug: m[1], topicSlug: m[2] };
  if ((m = p.match(/^\/explore\/([^/]+)$/))) return { kind: "course", path: p, courseSlug: m[1] };
  if (p === "/explore") return { kind: "explore", path: p };
  if ((m = p.match(/^\/modules\/([0-9a-f-]{36})$/))) return { kind: "module", path: p, moduleId: m[1] };
  if (p === "/modules") return { kind: "modules", path: p };
  if ((m = p.match(/^\/games\/([^/]+)$/))) return { kind: "game", path: p, gameId: m[1] };
  if ((m = p.match(/^\/runs\/([^/]+)\/reveal$/))) return { kind: "reveal", path: p, runId: m[1] };
  if (p === "/home" || p === "/") return { kind: "home", path: p };
  if (p.startsWith("/daily")) return { kind: "daily", path: p };
  if (p === "/sonar") return { kind: "sonar", path: p };
  return { kind: "other", path: p };
}
