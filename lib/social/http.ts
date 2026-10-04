import "server-only";
import { getApiPlayer } from "@/lib/auth";
import { SocialError } from "./errors";
import { ensureProfile } from "./profile";

export { SocialError };

/**
 * Shared wrapper for the social route handlers: auth (401), the caller's Profile filled in
 * (username etc.), and SocialError → status. `fn` returns JSON data or a Response.
 */
export async function socialRoute(fn: (playerId: string) => Promise<unknown>): Promise<Response> {
  const playerId = await getApiPlayer();
  if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    await ensureProfile(playerId);
    const result = await fn(playerId);
    return result instanceof Response ? result : Response.json(result);
  } catch (e) {
    if (e instanceof SocialError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

/** `?scope=` → "global" (default) or "friends"; anything else is a 400. */
export function parseScope(value: string | null): "global" | "friends" {
  if (value === null || value === "" || value === "global") return "global";
  if (value === "friends") return "friends";
  throw new SocialError(400, "scope must be global or friends");
}

/** `?limit=` → 1..100, default `fallback`. */
export function parseLimit(value: string | null, fallback = 50): number {
  if (value === null || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new SocialError(400, "limit must be 1–100");
  return n;
}
