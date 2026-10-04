"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Chip, PixelIcon, StreakFlame, Tabs } from "@/components/ui";
import { PlayerAvatar } from "@/components/site/PlayerAvatar";
import { EmptyState } from "@/components/social/EmptyState";
import { FriendButton } from "@/components/social/FriendButton";
import { RankEmblem } from "@/components/social/RankEmblem";
import { socialApi, userHref } from "@/components/social/api";
import { timeAgo } from "@/components/social/format";
import type { FriendRequest, FriendStatus, FriendsList, PlayerSearchResult, PlayerSummary, Streak } from "@/lib/social/types";

export type FriendsTab = "friends" | "requests" | "find";

/** `now`: the server's clock, so "2h ago" renders the same on server and client. */
type Props = { initial: FriendsList; streaks: Record<string, Streak>; initialTab: FriendsTab; now: number };

const keyOf = (p: PlayerSummary) => p.username ?? p.displayName;

function PlayerLine({ player, sub }: { player: PlayerSummary; sub?: React.ReactNode }) {
  return (
    <Link href={userHref(player)} className="group flex min-w-0 flex-1 items-center gap-3 rounded-md">
      <PlayerAvatar player={player} size={48} />
      <span className="min-w-0">
        <span className="block truncate font-display text-text group-hover:text-signal">{player.displayName}</span>
        <span className="block truncate text-xs text-muted">
          {player.username && <span className="text-signal/80">@{player.username}</span>}
          {sub}
        </span>
      </span>
    </Link>
  );
}

function FriendCard({ player, streak, since, onRemoved, i, now }: { player: PlayerSummary; streak: Streak | undefined; since: string; onRemoved: () => void; i: number; now: number }) {
  const s = streak ?? { current: 0, longest: 0, playedToday: false };
  return (
    <li className="card group relative flex flex-col gap-3 bg-surface/95 p-4 transition duration-300 hover:-translate-y-1 hover:border-border-strong hover:shadow-[0_14px_30px_-14px_var(--signal)]" style={{ "--i": i } as React.CSSProperties}>
      <PlayerLine player={player} />
      <div className="flex items-center gap-3 text-sm">
        <Chip tone="reward" icon={<PixelIcon name="star" size={12} />}>
          Lv {player.level}
        </Chip>
        <span className="flex items-center gap-1 text-muted">
          <RankEmblem rank={player.rank} size={16} /> {player.rank}
        </span>
        <span className="ml-auto flex items-center gap-1 font-display text-text" title={`${s.current}-day streak${s.playedToday ? ", played today" : ""}`}>
          <StreakFlame days={s.current} active={s.playedToday && s.current > 0} showCount={false} size={20} />
          {s.current}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <span className="text-xs text-faint">Friends since {timeAgo(since, now)}</span>
        {player.username && (
          <FriendButton username={player.username} displayName={player.displayName} status="friends" requestId={null} size="sm" onChange={(st) => st === "none" && onRemoved()} />
        )}
      </div>
    </li>
  );
}

function RequestRow({ req, kind, onDone, now }: { req: FriendRequest; kind: "incoming" | "outgoing"; onDone: (status: FriendStatus) => void; now: number }) {
  return (
    <li className="card flex flex-col gap-3 bg-surface/95 p-3 sm:flex-row sm:items-center animate-rise-in">
      <PlayerLine
        player={req.player}
        sub={
          <>
            {" · "}Lv {req.player.level} {req.player.rank} · {kind === "incoming" ? "asked" : "sent"} {timeAgo(req.createdAt, now)}
          </>
        }
      />
      {req.player.username && (
        <FriendButton username={req.player.username} displayName={req.player.displayName} status={kind} requestId={req.id} size="sm" onChange={(st) => onDone(st)} />
      )}
    </li>
  );
}

function FindTab({ onFriended }: { onFriended: (r: PlayerSearchResult, status: FriendStatus, requestId: string | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlayerSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (term.length === 0) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { players } = await socialApi.search(term, 20, ctrl.signal);
        setResults(players);
      } catch {
        /* aborted */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const term = q.trim();
  return (
    <div>
      <label className="relative mb-4 block">
        <span className="sr-only">Search by username or name</span>
        <span aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2">
          <PixelIcon name="eye" size={18} />
        </span>
        <input
          ref={input}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or name…"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="h-12 w-full rounded-md border border-border bg-bg-2 pr-10 pl-10 text-text outline-none placeholder:text-faint focus:border-signal"
        />
        {loading && (
          <span aria-hidden="true" className="absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-signal border-t-transparent" />
        )}
      </label>
      <div aria-live="polite">
        {term.length === 0 ? (
          <EmptyState say="Know someone's username? Type it above and I'll fetch them." title="Find a fellow diver" />
        ) : results === null ? null : results.length === 0 ? (
          <EmptyState say={`No one called “${term}” down here. Check the spelling?`} title="No divers found" />
        ) : (
          <ul className="stagger flex flex-col gap-2">
            {results.map((r, i) => (
              <li key={keyOf(r.player)} className="card flex flex-col gap-3 bg-surface/95 p-3 sm:flex-row sm:items-center" style={{ "--i": i } as React.CSSProperties}>
                <PlayerLine player={r.player} sub={<> · Lv {r.player.level} {r.player.rank}</>} />
                {r.player.username && (
                  <FriendButton
                    username={r.player.username}
                    displayName={r.player.displayName}
                    status={r.friendStatus}
                    requestId={r.friendRequestId}
                    size="sm"
                    onChange={(st, id) => onFriended(r, st, id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function FriendsClient({ initial, streaks, initialTab, now }: Props) {
  const [tab, setTab] = useState<FriendsTab>(initialTab);
  const [friends, setFriends] = useState(initial.friends);
  const [incoming, setIncoming] = useState(initial.incoming);
  const [outgoing, setOutgoing] = useState(initial.outgoing);

  const changeTab = (t: string) => {
    setTab(t as FriendsTab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  };

  const addFriend = (player: PlayerSummary) => {
    setFriends((f) => (f.some((x) => keyOf(x.player) === keyOf(player)) ? f : [{ player, since: new Date().toISOString() }, ...f]));
  };

  const onIncoming = (req: FriendRequest, st: FriendStatus) => {
    setIncoming((l) => l.filter((r) => r.id !== req.id));
    if (st === "friends") addFriend(req.player);
  };
  const onOutgoing = (req: FriendRequest, st: FriendStatus) => {
    if (st === "none") setOutgoing((l) => l.filter((r) => r.id !== req.id));
    if (st === "friends") {
      setOutgoing((l) => l.filter((r) => r.id !== req.id));
      addFriend(req.player);
    }
  };
  const onSearchChange = (r: PlayerSearchResult, st: FriendStatus, requestId: string | null) => {
    const k = keyOf(r.player);
    if (st === "friends") {
      addFriend(r.player);
      setIncoming((l) => l.filter((x) => keyOf(x.player) !== k));
      setOutgoing((l) => l.filter((x) => keyOf(x.player) !== k));
    } else if (st === "outgoing" && requestId) {
      setOutgoing((l) => [{ id: requestId, player: r.player, createdAt: new Date().toISOString() }, ...l.filter((x) => keyOf(x.player) !== k)]);
    } else if (st === "none") {
      setFriends((l) => l.filter((x) => keyOf(x.player) !== k));
      setIncoming((l) => l.filter((x) => keyOf(x.player) !== k));
      setOutgoing((l) => l.filter((x) => keyOf(x.player) !== k));
    }
  };

  const requests = incoming.length + outgoing.length;

  return (
    <div>
      <Tabs
        label="Friends sections"
        value={tab}
        onChange={changeTab}
        tabs={[
          { id: "friends", label: "Friends", count: friends.length },
          { id: "requests", label: "Requests", count: requests },
          { id: "find", label: "Find" },
        ]}
        className="mb-5"
      />

      <div role="tabpanel" aria-label={tab}>
        {tab === "friends" &&
          (friends.length === 0 ? (
            <EmptyState say="Diving solo? Friends make streaks way more fun." title="No friends yet">
              <button type="button" onClick={() => changeTab("find")} className="font-display text-sm text-signal hover:underline">
                Find friends →
              </button>
            </EmptyState>
          ) : (
            <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {friends.map((f, i) => (
                <FriendCard
                  key={keyOf(f.player)}
                  i={i}
                  now={now}
                  player={f.player}
                  since={f.since}
                  streak={f.player.username ? streaks[f.player.username] : undefined}
                  onRemoved={() => setFriends((l) => l.filter((x) => keyOf(x.player) !== keyOf(f.player)))}
                />
              ))}
            </ul>
          ))}

        {tab === "requests" && (
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="incoming-title">
              <h2 id="incoming-title" className="label-line mb-3">
                Incoming {incoming.length > 0 && <span className="text-accent">· {incoming.length}</span>}
              </h2>
              {incoming.length === 0 ? (
                <EmptyState say="No knocks on the hatch right now." title="No incoming requests" />
              ) : (
                <ul className="flex flex-col gap-2">
                  {incoming.map((r) => (
                    <RequestRow key={r.id} req={r} kind="incoming" now={now} onDone={(st) => onIncoming(r, st)} />
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="outgoing-title">
              <h2 id="outgoing-title" className="label-line mb-3">
                Sent
              </h2>
              {outgoing.length === 0 ? (
                <EmptyState say="You haven't sent any requests. Go make a friend!" title="No pending requests">
                  <button type="button" onClick={() => changeTab("find")} className="font-display text-sm text-signal hover:underline">
                    Find friends →
                  </button>
                </EmptyState>
              ) : (
                <ul className="flex flex-col gap-2">
                  {outgoing.map((r) => (
                    <RequestRow key={r.id} req={r} kind="outgoing" now={now} onDone={(st) => onOutgoing(r, st)} />
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {tab === "find" && <FindTab onFriended={onSearchChange} />}
      </div>
    </div>
  );
}
