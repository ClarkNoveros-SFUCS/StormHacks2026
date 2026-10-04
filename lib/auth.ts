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
  const devId = devPlayerId();
  if (devId) {
    await ensurePlayer(devId);
    return devId;
  }
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
  const devId = devPlayerId();
  if (devId) {
    await ensurePlayer(devId);
    return devId;
  }
  const { userId } = await auth();
  if (!userId) return null;
  await ensurePlayer(userId);
  return userId;
}

/**
 * Dev-only auth bypass (overnight-decisions §11): with DEV_PLAYER_ID set and NODE_ENV === "development"
 * (only `next dev`), every request acts as that Player without Clerk, so agents can render signed-in
 * pages. A no-op in production builds and tests. Never set DEV_PLAYER_ID in a deployed environment.
 */
function devPlayerId(): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  return process.env.DEV_PLAYER_ID || null;
}

// Not cached per process: a shared dev DB can be reset under a running server.
async function ensurePlayer(id: string) {
  await sql`insert into players (id) values (${id}) on conflict (id) do nothing`;
}
