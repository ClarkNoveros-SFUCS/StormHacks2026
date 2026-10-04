import "server-only";
import { getApiPlayer } from "@/lib/auth";
import { RunError } from "@/lib/runs/run-engine";
import { SocialError } from "@/lib/social/errors";
import { ensureProfile } from "@/lib/social/profile";
import { DailyError } from "./queries";

/**
 * Shared wrapper for the Daily route handlers. `auth: "optional"` (today's teaser, the
 * archive, the global board) passes null when signed out; `auth: "required"` answers 401.
 * A signed-in caller's Profile is filled in (so they show on boards). DailyError, RunError
 * and SocialError → their status; `fn` returning null → 404.
 */
export async function dailyRoute(
  auth: "optional" | "required",
  fn: (playerId: string | null) => Promise<unknown>,
  notFound = "Not found",
): Promise<Response> {
  const playerId = await getApiPlayer();
  if (auth === "required" && !playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    if (playerId) await ensureProfile(playerId);
    const result = await fn(playerId);
    if (result === null) return Response.json({ error: notFound }, { status: 404 });
    return Response.json(result);
  } catch (e) {
    if (e instanceof DailyError || e instanceof RunError || e instanceof SocialError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
