import "server-only";
import { sql } from "@/lib/db";
import type { Streak } from "@/lib/social/types";
import { streakFor } from "@/lib/social/xp";

/** Each accepted friend's Streak, by username (for the flame on friend cards). */
export async function friendStreaks(me: string): Promise<Record<string, Streak>> {
  const rows = await sql<{ id: string; username: string | null }[]>`
    select p.id, p.username
    from friendships f
    join players p on p.id = case when f.requester = ${me} then f.addressee else f.requester end
    where f.status = 'accepted' and (f.requester = ${me} or f.addressee = ${me})
    limit 200`;
  const streaks = await Promise.all(rows.map((r) => streakFor(r.id)));
  const out: Record<string, Streak> = {};
  rows.forEach((r, i) => {
    if (r.username) out[r.username] = streaks[i];
  });
  return out;
}

/** The server's clock for "2h ago" labels, so server and client render the same text. */
export function serverNow(): number {
  return Date.now();
}
