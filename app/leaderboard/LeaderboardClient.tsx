"use client";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button, Chip, PixelIcon, Tabs } from "@/components/ui";
import { NextDailyCountdown } from "@/components/landing/Countdown";
import { PlayerAvatar } from "@/components/site/PlayerAvatar";
import { EmptyState } from "@/components/social/EmptyState";
import { socialApi, userHref } from "@/components/social/api";
import { formatCountdown, msUntilWeeklyReset } from "@/components/social/format";
import { RankEmblem } from "@/components/social/RankEmblem";
import { useReducedMotion } from "@/lib/motion";
import type { Leaderboard, LeaderboardEntry, LeaderboardScope } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";
import { fetchDailyBoard, type DailyInfo } from "./daily";
import { Podium } from "./Podium";

export type BoardTab = "daily" | "weekly" | "courses";

const UNIT: Record<BoardTab, string> = { daily: "pts", weekly: "XP", courses: "topics" };

type Loaded = { status: "soon" } | { status: "ready"; board: Leaderboard } | { status: "error"; message: string };

const keyOf = (e: LeaderboardEntry) => e.player.username ?? e.player.displayName;

/** Ticking time until the weekly board resets (Monday 00:00 Vancouver). */
function WeeklyReset() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(msUntilWeeklyReset());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return <time className="font-hud text-lg tabular-nums text-signal">{ms === null ? "-d --:--:--" : formatCountdown(ms)}</time>;
}

function ScopeToggle({ value, onChange }: { value: LeaderboardScope; onChange: (s: LeaderboardScope) => void }) {
  const opts: { id: LeaderboardScope; label: string; icon: "users" | "sparkle" }[] = [
    { id: "global", label: "Global", icon: "sparkle" },
    { id: "friends", label: "Friends", icon: "users" },
  ];
  return (
    <div role="radiogroup" aria-label="Scope" className="relative inline-flex rounded-md border border-border bg-bg-2 p-1">
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-sm bg-surface-2 ring-1 ring-border-strong"
        style={{ left: value === "global" ? 4 : "50%", transition: "left .35s var(--ease-bounce)" }}
      />
      {opts.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => {
            if (value !== o.id) {
              sfx.toggle();
              onChange(o.id);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              onChange(value === "global" ? "friends" : "global");
            }
          }}
          tabIndex={value === o.id ? 0 : -1}
          className={`relative z-10 flex h-9 min-w-24 items-center justify-center gap-1.5 px-3 font-display text-sm transition-colors ${value === o.id ? "text-text" : "text-muted hover:text-text"}`}
        >
          <PixelIcon name={o.icon} size={14} />
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ e, unit, rowRef, pinned }: { e: LeaderboardEntry; unit: string; rowRef?: (el: HTMLLIElement | null) => void; pinned?: boolean }) {
  return (
    <li ref={rowRef} data-key={keyOf(e)} className={pinned ? "" : "will-change-transform"}>
      <Link
        href={userHref(e.player)}
        className={`group flex items-center gap-3 rounded-md border px-3 py-2 transition ${
          e.isMe ? "border-primary/70 bg-[#221d10] shadow-[0_0_0_1px_var(--primary)]" : "border-border/70 bg-surface/95 hover:border-border-strong hover:bg-surface-2"
        }`}
      >
        <span className={`w-8 shrink-0 text-center font-hud text-xl ${e.isMe ? "text-primary" : "text-muted"}`}>{e.place}</span>
        <PlayerAvatar player={e.player} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-text group-hover:text-signal">
            {e.player.displayName}
            {e.isMe && <span className="font-display text-primary"> · you</span>}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            {e.player.username && <span className="truncate">@{e.player.username}</span>}
            <span aria-hidden="true">·</span>
            <RankEmblem rank={e.player.rank} size={12} />
            <span className="whitespace-nowrap">Lv {e.player.level}</span>
          </span>
        </span>
        <span className="shrink-0 text-right font-hud text-2xl leading-none text-reward">
          {e.value.toLocaleString("en-US")}
          <span className="ml-1 text-sm text-muted">{unit}</span>
        </span>
      </Link>
    </li>
  );
}

/** Rows below the podium. FLIP: when the board changes (scope switch), rows glide to their new spot. */
function BoardList({ board, unit }: { board: Leaderboard; unit: string }) {
  const reduced = useReducedMotion();
  const rows = useRef(new Map<string, HTMLLIElement>());
  const prevTops = useRef(new Map<string, number>());
  const rest = board.entries.slice(3);
  const meShown = board.entries.some((e) => e.isMe);

  useLayoutEffect(() => {
    const next = new Map<string, number>();
    rows.current.forEach((el, key) => {
      next.set(key, el.offsetTop);
      if (reduced) return;
      const before = prevTops.current.get(key);
      if (before === undefined) {
        el.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "cubic-bezier(.22,1,.36,1)", delay: Math.min(next.size * 25, 400), fill: "backwards" });
      } else if (before !== el.offsetTop) {
        el.animate([{ transform: `translateY(${before - el.offsetTop}px)` }, { transform: "none" }], { duration: 520, easing: "cubic-bezier(.2,1.2,.4,1)" });
      }
    });
    prevTops.current = next;
  }, [board, reduced]);

  const ref = (key: string) => (el: HTMLLIElement | null) => {
    if (el) rows.current.set(key, el);
    else rows.current.delete(key);
  };

  return (
    <div className="mt-6">
      {rest.length > 0 && (
        <ol className="relative flex flex-col gap-2" aria-label="Rankings">
          {rest.map((e) => (
            <Row key={keyOf(e)} e={e} unit={unit} rowRef={ref(keyOf(e))} />
          ))}
        </ol>
      )}
      {!meShown && board.me && (
        <div className="sticky bottom-3 z-10 mt-4">
          <p className="mb-1 text-center text-xs text-faint" aria-hidden="true">
            ⋯ {board.total.toLocaleString("en-US")} on the board ⋯
          </p>
          <ol aria-label="Your place">
            <Row e={board.me} unit={unit} pinned />
          </ol>
        </div>
      )}
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading leaderboard" className="flex flex-col gap-2">
      <div className="mx-auto mb-4 flex h-44 w-full max-w-xl items-end gap-4">
        {[60, 100, 40].map((h, i) => (
          <div key={i} className="flex-1 animate-pulse rounded-t-md bg-surface-2" style={{ height: `${h}%` }} />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-md bg-surface-2/70" />
      ))}
    </div>
  );
}

const SUBTITLE: Record<BoardTab, string> = {
  daily: "Today's Daily Dive: your first finished Run of the day counts. Ties go to whoever finished first.",
  weekly: "XP earned this week from every Run, Topic and Daily.",
  courses: "Course Topics passed. Ties go to whoever got there first.",
};

export function LeaderboardClient({ initialTab, initialWeekly, daily }: { initialTab: BoardTab; initialWeekly: Leaderboard; daily: DailyInfo }) {
  const [tab, setTab] = useState<BoardTab>(initialTab);
  const [scope, setScope] = useState<LeaderboardScope>("global");
  const [cache, setCache] = useState<Record<string, Loaded>>({ "weekly:global": { status: "ready", board: initialWeekly } });
  const key = `${tab}:${scope}`;
  const loaded = cache[key];
  const inflight = useRef(new Set<string>());

  const load = useCallback(
    async (t: BoardTab, s: LeaderboardScope) => {
      const k = `${t}:${s}`;
      if (inflight.current.has(k)) return;
      inflight.current.add(k);
      try {
        const result: Loaded =
          t === "daily"
            ? await fetchDailyBoard(daily, s)
            : { status: "ready", board: t === "weekly" ? await socialApi.weeklyXp(s) : await socialApi.course(s) };
        setCache((c) => ({ ...c, [k]: result }));
      } catch (e) {
        setCache((c) => ({ ...c, [k]: { status: "error", message: (e as Error).message } }));
      } finally {
        inflight.current.delete(k);
      }
    },
    [daily],
  );

  const retry = () =>
    setCache((c) => {
      const next = { ...c };
      delete next[key];
      return next;
    });

  useEffect(() => {
    if (!cache[key]) load(tab, scope);
  }, [key, cache, load, tab, scope]);

  const changeTab = (t: string) => {
    setTab(t as BoardTab);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", t);
      window.history.replaceState(null, "", url);
    } catch {
      /* ignore */
    }
  };

  // While the new scope loads, keep showing the previous board so rows can FLIP into place.
  const [shown, setShown] = useState<Loaded | undefined>(loaded);
  const [shownKey, setShownKey] = useState(key);
  if (loaded && loaded !== shown) {
    setShown(loaded);
    setShownKey(key);
  }
  const sameTab = shownKey.split(":")[0] === tab;
  const view = loaded ?? (sameTab ? shown : undefined);
  const unit = UNIT[tab];

  return (
    <div>
      <Tabs
        label="Leaderboards"
        value={tab}
        onChange={changeTab}
        tabs={[
          { id: "daily", label: "Daily Dive" },
          { id: "weekly", label: "Weekly XP" },
          { id: "courses", label: "Courses" },
        ]}
        className="mb-4"
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-sm text-muted">{SUBTITLE[tab]}</p>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>

      {tab === "weekly" && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-2 bg-surface/95 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            <PixelIcon name="clock" size={16} /> Resets Monday at midnight (Vancouver) in
          </span>
          <WeeklyReset />
        </div>
      )}
      {tab === "daily" && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-2 bg-surface/95 px-4 py-3">
          <span className="flex items-center gap-2 text-sm text-muted">
            <PixelIcon name="bolt" size={16} /> Daily #{daily.number} · next Daily in
          </span>
          <NextDailyCountdown className="text-lg text-signal" />
        </div>
      )}

      <div role="tabpanel" aria-label={`${tab} leaderboard, ${scope}`} aria-live="polite">
        {!view ? (
          <BoardSkeleton />
        ) : view.status === "soon" ? (
          <EmptyState say="I'm still filling the Daily Dive tank. Check back very soon!" title="Daily Dive arrives soon">
            <p className="max-w-sm text-sm text-muted">One shared puzzle a day, one counted attempt, and a board for everyone who dives.</p>
            <Button href="/daily" variant="primary" size="sm">
              Go to the Daily hub
            </Button>
          </EmptyState>
        ) : view.status === "error" ? (
          <EmptyState say="Glub… the board slipped through my fins." title="Couldn't load this board">
            <Button variant="secondary" size="sm" onClick={retry}>
              Try again
            </Button>
          </EmptyState>
        ) : view.board.entries.length === 0 ? (
          <EmptyState
            say={scope === "friends" ? "Your friends haven't scored here yet. Nudge them!" : tab === "courses" ? "Nobody has passed a Topic yet. Be the first!" : "The board is empty. First one in wins!"}
            title="Nobody on the board yet"
          >
            <Button href={tab === "courses" ? "/explore" : tab === "daily" ? "/daily" : "/home"} variant="primary" size="sm">
              {tab === "courses" ? "Start a course" : "Play now"}
            </Button>
          </EmptyState>
        ) : (
          <>
            <Podium key={`${tab}:${shownKey}`} entries={view.board.entries} unit={unit} />
            <BoardList board={view.board} unit={unit} />
            {scope === "friends" && view.board.total <= 1 && (
              <p className="mt-6 text-center text-sm text-muted">
                It&apos;s lonely at the top.{" "}
                <Link href="/friends?tab=find" className="font-display text-signal hover:underline">
                  Add friends
                </Link>{" "}
                to race them.
              </p>
            )}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-faint">
              <Chip tone="neutral" size="sm">
                {view.board.total.toLocaleString("en-US")} {view.board.total === 1 ? "player" : "players"}
              </Chip>
              {scope === "friends" ? "you and your friends" : "everyone"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
