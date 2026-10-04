import "server-only";
import { auth } from "@clerk/nextjs/server";
import { sql } from "./db";

// Players already upserted by this server process, so most requests skip the write.
const knownPlayers = new Set<string>();

/**
 * The signed-in Player's id (the Clerk user id), for filtering every query.
 * Call it first in every page, route handler and server action that touches Player data:
 * it is the auth check (proxy.ts doesn't gate routes). Signed out, `auth.protect()`
 * redirects pages to sign-in and returns 404 for route handlers.
 * Ensures a `players` row exists.
 */
export async function requirePlayer(): Promise<string> {
  const { userId } = await auth.protect();
  if (!knownPlayers.has(userId)) {
    await sql`insert into players (id) values (${userId}) on conflict (id) do nothing`;
    knownPlayers.add(userId);
  }
  return userId;
}
