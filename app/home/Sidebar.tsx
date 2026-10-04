// The dashboard sidebar: profile card, weekly XP board and friends. Server components except
// ProfileSidebar (client: the avatar editor).
import Link from "next/link";
import { PlayerAvatar } from "@/components/site/PlayerAvatar";
import { Chip, PixelIcon } from "@/components/ui";
import type { FriendsList, Leaderboard, LeaderboardEntry } from "@/lib/social/types";
import { ProfileSidebar } from "./ProfileSidebar";

export { ProfileSidebar };

function BoardRow({ e }: { e: LeaderboardEntry }) {
  const href = e.player.username ? `/u/${e.player.username}` : "/profile";
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-sm px-2 py-1.5 transition hover:bg-surface-2 ${e.isMe ? "bg-surface-2 ring-1 ring-primary/60" : ""}`}
      >
        <span className={`w-6 text-center font-display ${e.place <= 3 ? "text-reward" : "text-faint"}`}>{e.place}</span>
        <PlayerAvatar player={e.player} size={28} bob={false} />
        <span className="min-w-0 flex-1 truncate text-sm text-text">
          {e.player.displayName}
          {e.isMe && <span className="text-muted"> (you)</span>}
        </span>
        <span className="font-hud text-lg text-reward">{e.value.toLocaleString("en-US")}</span>
      </Link>
    </li>
  );
}

/** This week's XP: friends if you have any, otherwise everyone. Your row is pinned. */
export function WeeklyBoard({ board }: { board: Leaderboard }) {
  const meInTop = board.entries.some((e) => e.isMe);
  return (
    <section aria-labelledby="board-title" className="card bg-surface/95 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="board-title" className="flex items-center gap-2 text-lg text-text">
          <PixelIcon name="trophy" size={18} /> Weekly XP
        </h2>
        <Chip tone={board.scope === "friends" ? "violet" : "signal"}>{board.scope === "friends" ? "Friends" : "Everyone"}</Chip>
      </div>
      {board.entries.length === 0 ? (
        <p className="text-sm text-muted">No XP on the board this week yet. Finish a Run to be first.</p>
      ) : (
        <ol className="space-y-1">
          {board.entries.map((e) => (
            <BoardRow key={`${e.place}-${e.player.username}`} e={e} />
          ))}
          {!meInTop && board.me && (
            <>
              <li aria-hidden="true" className="px-2 text-center text-faint">
                ⋯
              </li>
              <BoardRow e={board.me} />
            </>
          )}
        </ol>
      )}
      <Link href="/leaderboard" className="mt-3 inline-block font-display text-sm text-signal hover:underline">
        Full leaderboards →
      </Link>
    </section>
  );
}

/**
 * Friends at a glance. An activity feed would go here; F21 has no feed yet, so this lists
 * friends and pending requests with a nudge to add more.
 */
export function FriendsPanel({ friends }: { friends: FriendsList }) {
  const list = friends.friends.slice(0, 5);
  return (
    <section aria-labelledby="friends-title" className="card bg-surface/95 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="friends-title" className="flex items-center gap-2 text-lg text-text">
          <PixelIcon name="users" size={18} /> Friends
        </h2>
        {friends.incoming.length > 0 && (
          <Link href="/friends" className="rounded-sm">
            <Chip tone="accent">
              {friends.incoming.length} request{friends.incoming.length === 1 ? "" : "s"}
            </Chip>
          </Link>
        )}
      </div>
      {list.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong bg-bg-2 p-4 text-center">
          <p className="text-sm text-muted">Diving solo? Add friends by username to compare streaks and race the weekly board.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {list.map((f) => (
            <li key={f.player.username ?? f.player.displayName}>
              <Link href={f.player.username ? `/u/${f.player.username}` : "/friends"} className="flex items-center gap-3 rounded-sm px-2 py-1.5 transition hover:bg-surface-2">
                <PlayerAvatar player={f.player} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-text">{f.player.displayName}</span>
                  <span className="block text-xs text-muted">
                    Level {f.player.level} · {f.player.rank}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-faint">Friends&apos; recent dives will show up here soon.</p>
      <Link href="/friends" className="mt-2 inline-block font-display text-sm text-signal hover:underline">
        Find friends →
      </Link>
    </section>
  );
}
