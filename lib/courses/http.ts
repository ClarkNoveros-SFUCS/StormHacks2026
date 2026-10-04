import "server-only";
import { getApiPlayer } from "@/lib/auth";
import { CourseError } from "./queries";

/**
 * Shared wrapper for the Course route handlers. `auth: "optional"` (the catalogue and
 * readings, public per Q24) passes null when signed out; `auth: "required"` answers 401.
 * CourseError → its status; `fn` returning null → 404.
 */
export async function courseRoute(
  auth: "optional" | "required",
  fn: (playerId: string | null) => Promise<unknown>,
): Promise<Response> {
  const playerId = await getApiPlayer();
  if (auth === "required" && !playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
  try {
    const result = await fn(playerId);
    if (result === null) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(result);
  } catch (e) {
    if (e instanceof CourseError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
