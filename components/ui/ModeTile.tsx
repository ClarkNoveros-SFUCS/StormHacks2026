"use client";
import type { ReactNode } from "react";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import s from "./ModeTile.module.css";

/** The looping mini-scene for a Mode (SVG, 120×72). Plays while the tile is hovered/focused/selected. */
export function ModeScene({ mode }: { mode: ModeUiId }) {
  const m = MODE_UI[mode];
  const scenes: Record<ModeUiId, ReactNode> = {
    dive: (
      <>
        <rect width="120" height="72" fill="#0b2a4a" />
        <rect width="120" height="14" fill="#2b5c8a" />
        <rect y="14" width="120" height="2" fill="#7fd6ff" opacity=".5" />
        <rect y="48" width="120" height="24" fill="#071528" />
        <g className={s.fish}>
          <rect x="0" y="36" width="8" height="4" fill="#ff5d8f" />
          <rect x="-3" y="35" width="3" height="6" fill="#ff5d8f" />
        </g>
        <g className={s.diver}>
          <rect x="56" y="22" width="8" height="8" fill="#ffd166" />
          <rect x="58" y="24" width="4" height="3" fill="#4de3ff" />
          <rect x="57" y="30" width="6" height="6" fill="#ffd166" />
        </g>
        {[20, 44, 88, 100].map((x, i) => (
          <rect key={x} className={s.bubble} style={{ animationDelay: `${i * 0.5}s` }} x={x} y="62" width="3" height="3" fill="none" stroke="#4de3ff" strokeWidth="1" />
        ))}
      </>
    ),
    apogee: (
      <>
        <rect width="120" height="72" fill="#050616" />
        {[12, 30, 50, 74, 96, 110].map((x, i) => (
          <rect key={x} className={s.streak} style={{ animationDelay: `${i * 0.15}s` }} x={x} y="0" width="1" height={6 + (i % 3) * 3} fill="#8fd3ff" opacity=".7" />
        ))}
        <g className={s.rocket}>
          <rect x="56" y="18" width="8" height="22" fill="#e9edf6" />
          <rect x="58" y="12" width="4" height="6" fill="#ff7a3d" />
          <rect x="54" y="34" width="2" height="8" fill="#ff7a3d" />
          <rect x="64" y="34" width="2" height="8" fill="#ff7a3d" />
          <rect x="58" y="24" width="4" height="4" fill="#4de3ff" />
          <rect className={s.flameTail} x="57" y="40" width="6" height="8" fill="#ffd84d" />
        </g>
      </>
    ),
    leap: (
      <>
        <rect width="120" height="72" fill="#7ad7ff" />
        <rect x="80" y="10" width="24" height="6" fill="#fff" opacity=".8" />
        <rect x="10" y="60" width="26" height="6" fill="#3ddc97" />
        <rect x="10" y="66" width="26" height="4" fill="#9a5a2a" />
        <rect x="46" y="44" width="22" height="6" fill="#3ddc97" />
        <rect x="46" y="50" width="22" height="4" fill="#9a5a2a" />
        <rect x="80" y="28" width="24" height="6" fill="#3ddc97" />
        <rect x="80" y="34" width="24" height="4" fill="#9a5a2a" />
        <g className={s.hopper}>
          <rect x="18" y="50" width="10" height="10" fill="#ffd84d" />
          <rect x="20" y="53" width="2" height="2" fill="#0b0e1d" />
          <rect x="24" y="53" width="2" height="2" fill="#0b0e1d" />
        </g>
      </>
    ),
    pairs: (
      <>
        <rect width="120" height="72" fill="#261638" />
        <rect className={s.cardA} x="34" y="18" width="20" height="28" fill="#ff9f43" />
        <rect x="38" y="24" width="12" height="2" fill="#261638" opacity=".5" />
        <rect className={s.cardB} x="66" y="18" width="20" height="28" fill="#9d7bff" />
        <rect x="70" y="24" width="12" height="2" fill="#261638" opacity=".5" />
        <rect x="14" y="54" width="92" height="2" fill="#3a2550" />
      </>
    ),
    blitz: (
      <>
        <rect width="120" height="72" fill="#0b0418" />
        <rect className={s.beat} x="10" y="8" width="100" height="56" fill="none" stroke="#ff3df0" strokeWidth="2" />
        <text className={s.flashT} x="30" y="46" fill="#3dfcff" fontSize="22" fontFamily="monospace" fontWeight="bold">T</text>
        <text className={s.flashF} x="78" y="46" fill="#ff3df0" fontSize="22" fontFamily="monospace" fontWeight="bold">F</text>
        <rect x="56" y="20" width="4" height="32" fill="#f6ff3d" opacity=".7" />
      </>
    ),
    arena: (
      <>
        <rect width="120" height="72" fill="#0a0d1c" />
        <rect y="46" width="120" height="26" fill="#11162e" />
        {/* floor grid and neon trims */}
        {[0, 20, 40, 60, 80, 100, 120].map((x) => (
          <line key={x} x1={60 + (x - 60) * 0.35} y1="46" x2={x} y2="72" stroke="#4de3ff" strokeOpacity=".18" />
        ))}
        <rect y="45" width="120" height="1" fill="#ff4d6d" opacity=".8" />
        <rect y="6" width="120" height="1" fill="#4de3ff" opacity=".45" />
        {[
          [14, 18, "#4de3ff"],
          [40, 26, "#9d7bff"],
          [70, 16, "#ffd84d"],
          [94, 28, "#3ddc97"],
        ].map(([x, y, c], i) => (
          <g key={i} className={s.target} style={{ animationDelay: `${i * -0.7}s` }}>
            <rect x={x as number} y={y as number} width="14" height="10" fill="#0f1326" stroke={c as string} />
            <rect x={(x as number) + 3} y={(y as number) + 4} width="8" height="2" fill={c as string} opacity=".7" />
          </g>
        ))}
        <line className={s.zap} x1="66" y1="72" x2="82" y2="27" stroke="#ff4d6d" strokeWidth="1.5" />
        <g className={s.crosshair}>
          <rect x="59" y="26" width="2" height="6" fill="#ff4d6d" />
          <rect x="59" y="38" width="2" height="6" fill="#ff4d6d" />
          <rect x="51" y="34" width="6" height="2" fill="#ff4d6d" />
          <rect x="63" y="34" width="6" height="2" fill="#ff4d6d" />
        </g>
      </>
    ),
  };
  return (
    <svg viewBox="0 0 120 72" className={`${s.scene} block h-full w-full`} shapeRendering="crispEdges" aria-hidden="true">
      {scenes[mode]}
      <rect x="0" y="0" width="120" height="72" fill="none" stroke={m.accent} strokeOpacity=".25" />
    </svg>
  );
}

type TileProps = { mode: ModeUiId; selected?: boolean; locked?: boolean; onSelect?: (mode: ModeUiId) => void; className?: string };

/** Mode picker tile: mini-scene (plays on hover), name, tagline and rules. Locked tiles are dashed and inert. */
export function ModeTile({ mode, selected, locked, onSelect, className = "" }: TileProps) {
  const m = MODE_UI[mode];
  return (
    <button
      type="button"
      disabled={locked}
      aria-pressed={onSelect ? !!selected : undefined}
      data-selected={selected ? "true" : undefined}
      onMouseEnter={() => !locked && sfx.hover()}
      onClick={() => {
        if (locked) return;
        sfx.click();
        onSelect?.(mode);
      }}
      className={`${s.tile} group relative flex w-full flex-col overflow-hidden rounded-md border bg-surface text-left transition duration-300 ease-out ${
        locked
          ? "cursor-not-allowed border-dashed border-border opacity-70"
          : "hover:-translate-y-1 hover:shadow-[0_12px_30px_-12px_var(--tile-accent)]"
      } ${className}`}
      style={
        {
          "--tile-accent": m.accent,
          borderColor: selected ? m.accent : undefined,
          boxShadow: selected ? `0 0 0 2px ${m.accent}, 0 12px 30px -12px ${m.accent}` : undefined,
        } as React.CSSProperties
      }
    >
      <div className="relative aspect-[5/3] w-full">
        <ModeScene mode={mode} />
        {locked && (
          <span className="absolute inset-0 grid place-items-center bg-bg/60 font-display text-sm tracking-widest text-muted">
            COMING SOON
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="flex items-center gap-2 font-display text-lg" style={{ color: m.accent }}>
          <span aria-hidden="true">{m.icon}</span>
          {m.name}
        </span>
        <span className="text-sm text-text">{m.tagline}</span>
        <span className="text-xs text-muted">{m.rules}</span>
      </div>
    </button>
  );
}

/** Small Mode label for Game cards and Game pages. */
export function ModeBadge({ mode, className = "" }: { mode: ModeUiId; className?: string }) {
  const m = MODE_UI[mode];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-display text-[11px] tracking-widest uppercase ${className}`}
      style={{ color: m.accent, borderColor: `color-mix(in srgb, ${m.accent} 45%, transparent)`, background: `color-mix(in srgb, ${m.accent} 12%, transparent)` }}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.name}
    </span>
  );
}
