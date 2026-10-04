import "server-only";
import { auth } from "@clerk/nextjs/server";
import { sql } from "./db";

// proxy.ts doesn't gate routes, so one of these is the auth check. Call it first in every
// page, server action and route handler that touches Player data, then filter every query
// by the returned id. Both ensure a `players` row exists.

/**
 * Pages and server actions: the signed-in Player's id (the Clerk user id).
 * Signed out, it redirects to sign-in.
 */
export async function requirePlayer(): Promise<string> {
  const { userId } = await auth.protect();
  await ensurePlayer(userId);
  return userId;
}

/**
 * Route handlers: the signed-in Player's id, or null when signed out.
 * `auth.protect()` would redirect a signed-out fetch to the sign-in page, so instead:
 *   const playerId = await getApiPlayer();
 *   if (!playerId) return Response.json({ error: "Not signed in" }, { status: 401 });
 */
export async function getApiPlayer(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await ensurePlayer(userId);
  return userId;
}

// Not cached per process: a shared dev DB can be reset under a running server.
async function ensurePlayer(id: string) {
  await sql`insert into players (id) values (${id}) on conflict (id) do nothing`;
}
