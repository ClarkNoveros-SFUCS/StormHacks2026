import "server-only";
import { sql } from "@/lib/db";
import { SocialError, UUID } from "./errors";
import { playerSummaries, SYSTEM_PLAYER_ID } from "./profile";
import type { FriendRequest, FriendsList, FriendStatus, PlayerSearchResult } from "./types";
import { normalizeUsername } from "./username";
import { inTx, type Db } from "./xp";

// Friends: one friendships row per pair. Request by username, accept, decline, remove.
// No chat. Spec: docs/architecture/social.md.

type FriendshipRow = { id: string; requester: string; addressee: string; status: "pending" | "accepted" };

/** SQL fragment: ids of `me`'s accepted friends. */
export function friendIdsOf(db: Db, me: string) {
  return db`(
    select case when f.requester = ${me} then f.addressee else f.requester end
    from friendships f
    where f.status = 'accepted' and (f.requester = ${me} or f.addressee = ${me}))`;
}

/** How `me` relates to each of `others` (self, none, friends, incoming, outgoing). */
export async function friendStatuses(
  me: string, others: string[], db: Db = sql,
): Promise<Map<string, { status: FriendStatus; requestId: string | null }>> {
  const out = new Map<string, { status: FriendStatus; requestId: string | null }>();
  for (const id of others) out.set(id, { status: id === me ? "self" : "none", requestId: null });
  const ids = others.filter((id) => id !== me);
  if (ids.length === 0) return out;
  const rows = await db<FriendshipRow[]>`
    select id, requester, addressee, status from friendships
    where (requester = ${me} and addressee in ${db(ids)}) or (addressee = ${me} and requester in ${db(ids)})`;
  for (const r of rows) {
    const other = r.requester === me ? r.addressee : r.requester;
    const status: FriendStatus = r.status === "accepted" ? "friends" : r.requester === me ? "outgoing" : "incoming";
    out.set(other, { status, requestId: r.status === "pending" ? r.id : null });
  }
  return out;
}

async function playerIdByUsername(username: string, db: Db): Promise<string> {
  const [p] = await db<{ id: string }[]>`
    select id from players where username = ${normalizeUsername(username)} and id <> ${SYSTEM_PLAYER_ID}`;
  if (!p) throw new SocialError(404, "No Player with that username");
  return p.id;
}

/**
 * Sends a friend request. If they had already asked you, this accepts theirs instead.
 * Asking again while your request is pending is a no-op. 404 unknown username, 400 yourself,
 * 409 already friends.
 */
export async function sendFriendRequest(
  me: string, username: string, db: Db = sql,
): Promise<{ status: "pending" | "accepted"; requestId: string }> {
  return inTx(db, async (tx) => {
    const other = await playerIdByUsername(username, tx);
    if (other === me) throw new SocialError(400, "You can't add yourself");
    const [existing] = await tx<FriendshipRow[]>`
      select id, requester, addressee, status from friendships
      where least(requester, addressee) = least(${me}::text, ${other}::text)
        and greatest(requester, addressee) = greatest(${me}::text, ${other}::text)
      for update`;
    if (existing?.status === "accepted") throw new SocialError(409, "You're already friends");
    if (existing && existing.requester === me) return { status: "pending", requestId: existing.id };
    if (existing) {
      await tx`update friendships set status = 'accepted', responded_at = now() where id = ${existing.id}`;
      return { status: "accepted", requestId: existing.id };
    }
    const [row] = await tx<{ id: string }[]>`
      insert into friendships (requester, addressee, status) values (${me}, ${other}, 'pending')
      on conflict do nothing returning id`;
    if (!row) throw new SocialError(409, "A request between you already exists"); // lost a race
    return { status: "pending", requestId: row.id };
  });
}

/** Accepts a request sent to `me`. 404 if it isn't a pending request to `me`. */
export async function acceptFriendRequest(me: string, requestId: string, db: Db = sql): Promise<void> {
  if (!UUID.test(requestId)) throw new SocialError(404, "Friend request not found");
  const rows = await db`
    update friendships set status = 'accepted', responded_at = now()
    where id = ${requestId} and addressee = ${me} and status = 'pending' returning id`;
  if (rows.length === 0) throw new SocialError(404, "Friend request not found");
}

/** Declines a request sent to `me` (deletes it; they can ask again). */
export async function declineFriendRequest(me: string, requestId: string, db: Db = sql): Promise<void> {
  if (!UUID.test(requestId)) throw new SocialError(404, "Friend request not found");
  const rows = await db`
    delete from friendships where id = ${requestId} and addressee = ${me} and status = 'pending' returning id`;
  if (rows.length === 0) throw new SocialError(404, "Friend request not found");
}

/** Unfriends, or cancels/declines a pending request either way. 404 if there was nothing. */
export async function removeFriend(me: string, username: string, db: Db = sql): Promise<void> {
  const other = await playerIdByUsername(username, db);
  const rows = await db`
    delete from friendships
    where (requester = ${me} and addressee = ${other}) or (requester = ${other} and addressee = ${me})
    returning id`;
  if (rows.length === 0) throw new SocialError(404, "You're not friends");
}

/** Friends (most recent first) and pending requests both ways. */
export async function listFriends(me: string, db: Db = sql): Promise<FriendsList> {
  const rows = await db<(FriendshipRow & { created_at: Date; responded_at: Date | null })[]>`
    select id, requester, addressee, status, created_at, responded_at from friendships
    where requester = ${me} or addressee = ${me}
    order by coalesce(responded_at, created_at) desc`;
  const other = (r: FriendshipRow) => (r.requester === me ? r.addressee : r.requester);
  const summaries = await playerSummaries(rows.map(other), db);
  const list: FriendsList = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    const player = summaries.get(other(r));
    if (!player) continue;
    if (r.status === "accepted") {
      list.friends.push({ player, since: (r.responded_at ?? r.created_at).toISOString() });
    } else {
      const req: FriendRequest = { id: r.id, player, createdAt: r.created_at.toISOString() };
      (r.requester === me ? list.outgoing : list.incoming).push(req);
    }
  }
  return list;
}

/** Players whose username or display name starts with `q` (case-insensitive), not `me`. */
export async function searchPlayers(me: string, q: string, limit = 20, db: Db = sql): Promise<PlayerSearchResult[]> {
  const query = normalizeUsername(q).slice(0, 40);
  if (query.length === 0) return [];
  const like = query.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
  const rows = await db<{ id: string }[]>`
    select id from players
    where id <> ${me} and id <> ${SYSTEM_PLAYER_ID} and username is not null
      and (username like ${like} or lower(display_name) like ${like})
    order by (username = ${query}) desc, (username like ${like}) desc, username
    limit ${Math.min(Math.max(1, limit), 50)}`;
  const ids = rows.map((r) => r.id);
  const [summaries, statuses] = await Promise.all([playerSummaries(ids, db), friendStatuses(me, ids, db)]);
  return ids.flatMap((id) => {
    const player = summaries.get(id);
    const s = statuses.get(id)!;
    return player ? [{ player, friendStatus: s.status, friendRequestId: s.requestId }] : [];
  });
}
