"use client";
import Link from "next/link";
import { useRef } from "react";
import { Chip, PixelIcon } from "@/components/ui";
import { burstFrom } from "@/components/ui/Confetti";
import { PlayerAvatar } from "@/components/site/PlayerAvatar";
import { userHref } from "@/components/social/api";
import type { LeaderboardEntry } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";

// The top three on a pixel podium: 2 · 1 · 3, with gold/silver/bronze trophies. Hovering (or
// focusing) a step pops confetti from its trophy.

const STEPS = {
  1: { h: "h-28 sm:h-32", tone: { y: "#ffd84d", Y: "#c99a1e", w: "#fff6c2" }, edge: "#ffd84d", label: "1st" },
  2: { h: "h-20 sm:h-24", tone: { y: "#d6deef", Y: "#8d98b5", w: "#ffffff" }, edge: "#d6deef", label: "2nd" },
  3: { h: "h-14 sm:h-16", tone: { y: "#e09a5b", Y: "#9a5a2a", w: "#ffd0a0" }, edge: "#e09a5b", label: "3rd" },
} as const;

function Step({ entry, slot, unit, delay }: { entry: LeaderboardEntry | undefined; slot: 1 | 2 | 3; unit: string; delay: number }) {
  const trophy = useRef<HTMLSpanElement>(null);
  const last = useRef(0);
  const st = STEPS[slot];
  const pop = () => {
    const now = Date.now();
    if (now - last.current < 900) return;
    last.current = now;
    burstFrom(trophy.current, { count: slot === 1 ? 28 : 18, kind: "confetti", spread: 300 });
    sfx.pop();
  };
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ animation: `rise-in .6s var(--ease-out) ${delay}ms both` }}>
      {entry ? (
        <Link
          href={userHref(entry.player)}
          onMouseEnter={pop}
          onFocus={pop}
          className="group mb-2 flex w-full min-w-0 flex-col items-center gap-1 rounded-md px-1 text-center"
          aria-label={`${st.label} place: ${entry.player.displayName}, ${entry.value.toLocaleString("en-US")} ${unit}${entry.isMe ? " (you)" : ""}`}
        >
          {slot === 1 && (
            <span aria-hidden="true" className="-mb-1 animate-bob">
              <PixelIcon name="crown" size={22} />
            </span>
          )}
          <span className={`rounded-full p-0.5 transition group-hover:scale-110 ${entry.isMe ? "ring-2 ring-primary" : ""}`} style={{ boxShadow: `0 0 18px -4px ${st.edge}` }}>
            <span className="block overflow-hidden rounded-full">
              <PlayerAvatar player={entry.player} size={slot === 1 ? 64 : 52} />
            </span>
          </span>
          <span className="w-full truncate font-display text-sm text-text group-hover:text-signal">
            {entry.player.displayName}
            {entry.isMe && <span className="text-primary"> · you</span>}
          </span>
          <Chip tone="neutral" size="sm">
            Lv {entry.player.level}
          </Chip>
          <span className="font-hud text-2xl leading-none text-reward">
            {entry.value.toLocaleString("en-US")} <span className="text-sm text-muted">{unit}</span>
          </span>
        </Link>
      ) : (
        <span className="mb-2 font-display text-xs text-faint">empty</span>
      )}
      <div
        className={`relative flex w-full flex-col items-center justify-start gap-1 rounded-t-md border-x-2 border-t-2 pt-2 ${st.h}`}
        style={{
          borderColor: st.edge,
          background: `linear-gradient(180deg, color-mix(in srgb, ${st.edge} 28%, #141a33), #0f1326)`,
          boxShadow: `inset 0 4px 0 color-mix(in srgb, ${st.edge} 45%, transparent)`,
        }}
      >
        <span ref={trophy} className={slot === 1 ? "shine" : undefined}>
          <PixelIcon name="trophy" size={slot === 1 ? 30 : 24} palette={st.tone} />
        </span>
        <span className="font-display text-sm" style={{ color: st.edge }}>
          {st.label}
        </span>
      </div>
    </li>
  );
}

export function Podium({ entries, unit }: { entries: LeaderboardEntry[]; unit: string }) {
  // Ties share a place, so seat by order rather than by `place`.
  const [first, second, third] = entries;
  return (
    <ol className="mx-auto flex max-w-xl items-end gap-2 sm:gap-4" aria-label="Top three">
      <Step entry={second} slot={2} unit={unit} delay={120} />
      <Step entry={first} slot={1} unit={unit} delay={0} />
      <Step entry={third} slot={3} unit={unit} delay={220} />
    </ol>
  );
}
