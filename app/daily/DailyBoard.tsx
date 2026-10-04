"use client";
import Link from "next/link";
import { useState } from "react";
import { metres } from "@/components/daily/format";
import { PlayerAvatar } from "@/components/site/PlayerAvatar";
import { EmptyState } from "@/components/social/EmptyState";
import { RankEmblem } from "@/components/social/RankEmblem";
import { userHref } from "@/components/social/api";
import { PixelIcon, Tabs } from "@/components/ui";
import type { DailyLeaderboardResponse, Leaderboard } from "@/lib/daily/types";
import type { LeaderboardEntry, LeaderboardScope } from "@/lib/social/types";

const MEDAL = ["#ffd166", "#c9d4ec", "#e0915a"];
const clock = new Intl.DateTimeFormat("en-US", { timeZone: "America/Vancouver", hour: "numeric", minute: "2-digit" });

function Row({ e, i }: { e: LeaderboardEntry; i: number }) {
  const medal = e.place <= 3 ? MEDAL[e.place - 1] : null;
  return (
    <li style={{ "--i": i } as React.CSSProperties}>
      <Link
        href={userHref(e.player)}
        className={`group flex items-center gap-3 rounded-md border px-3 py-2 transition hover:-translate-y-0.5 ${
          e.isMe ? "border-primary/70 bg-[#221d10] shadow-[0_0_0_1px_var(--primary)]" : "border-border/70 bg-surface/95 hover:border-border-strong hover:bg-surface-2"
        }`}
      >
        <span className="flex w-8 shrink-0 justify-center font-hud text-2xl" style={{ color: medal ?? (e.isMe ? "var(--primary)" : "var(--muted)") }}>
          {medal ? <PixelIcon name="crown" size={20} palette={{ y: medal }} title={`Place ${e.place}`} /> : e.place}
        </span>
        <PlayerAvatar player={e.player} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text group-hover:text-signal">
            {e.player.displayName}
            {e.isMe && <span className="font-display text-primary"> · you</span>}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <RankEmblem rank={e.player.rank} size={12} />
            <span className="whitespace-nowrap">Lv {e.player.level}</span>
            {e.at && (
              <>
                <span aria-hidden="true">·</span>
                <span className="whitespace-nowrap">surfaced {clock.format(new Date(e.at))}</span>
              </>
            )}
          </span>
        </span>
        <span className="shrink-0 text-right font-hud text-2xl leading-none text-reward">
          {metres(e.value)}
          <span className="block text-xs text-muted">{e.value} pts</span>
        </span>
      </Link>
    </li>
  );
}

/** Today's Daily leaderboard: Global / Friends, top 10 plus your own row. */
export function DailyBoard({ initial, signedIn, number }: { initial: Leaderboard | null; signedIn: boolean; number: number }) {
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [boards, setBoards] = useState<Partial<Record<LeaderboardScope, Leaderboard | null>>>({ global: initial });
  const [error, setError] = useState<string | null>(null);
  const board = boards[scope];

  const change = async (next: string) => {
    const s = next as LeaderboardScope;
    setScope(s);
    setError(null);
    if (boards[s] !== undefined) return;
    try {
      const res = await fetch(`/api/daily/leaderboard?scope=${s}&limit=10`, { cache: "no-store" });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't load the board");
      const data = (await res.json()) as DailyLeaderboardResponse;
      setBoards((b) => ({ ...b, [s]: data.leaderboard }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load the board");
    }
  };

  const meShown = board?.entries.some((e) => e.isMe);
  return (
    <section id="leaderboard" aria-labelledby="board-title" className="card scroll-mt-24 bg-surface/95 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="board-title" className="flex items-center gap-2 font-display text-xl text-text">
          <PixelIcon name="trophy" size={20} /> Daily #{number} leaderboard
        </h2>
        <Link href="/leaderboard?tab=daily" className="text-sm text-muted underline-offset-4 hover:text-signal hover:underline">
          All leaderboards ▸
        </Link>
      </div>
      {signedIn && (
        <Tabs
          className="mt-3"
          label="Leaderboard scope"
          value={scope}
          onChange={change}
          tabs={[
            { id: "global", label: "Global" },
            { id: "friends", label: "Friends" },
          ]}
        />
      )}
      <p className="mt-3 text-xs text-faint">Your first finished dive of the day counts. Ties go to whoever surfaced first.</p>

      <div className="mt-4" role="tabpanel" aria-live="polite">
        {error && <p className="text-sm text-danger">{error}</p>}
        {!error && board === undefined && (
          <ul className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-[54px] animate-pulse rounded-md bg-surface-2/70" />
            ))}
          </ul>
        )}
        {!error && board && board.entries.length === 0 && (
          <EmptyState
            say={scope === "friends" ? "None of your friends have surfaced yet. Dive first and brag!" : "Nobody's surfaced yet today. The top spot is wide open!"}
            title={scope === "friends" ? "No friends on the board yet" : "Be the first diver on the board"}
          />
        )}
        {!error && board && board.entries.length > 0 && (
          <>
            <ol className="stagger flex flex-col gap-2" aria-label={`${scope === "global" ? "Global" : "Friends"} rankings`}>
              {board.entries.map((e, i) => (
                <Row key={`${e.place}-${e.player.username ?? e.player.displayName}`} e={e} i={i} />
              ))}
            </ol>
            {!meShown && board.me && (
              <div className="mt-3">
                <p className="mb-1 text-center text-xs text-faint" aria-hidden="true">
                  ⋯ {board.total.toLocaleString("en-US")} divers today ⋯
                </p>
                <ol aria-label="Your place">
                  <Row e={board.me} i={0} />
                </ol>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
