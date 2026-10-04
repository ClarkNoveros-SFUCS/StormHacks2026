"use client";
// Small shared pieces for each Mode's Game page stats panel (components/modes/<mode>/GameStats.tsx).
// The panel sits inside the Mode's theme (data-theme), so tokens and the display font follow it.
// Spec: docs/architecture/ui-map.md § Game page, docs/design/design-system.md §3.
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Meter } from "@/components/ui/Meter";
import { Odometer } from "@/components/ui/Odometer";

export type MasteryValue = { found: number; total: number; pct: number };

/** A stat label: small, spaced capitals in the theme's display font. */
export function StatLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`font-display text-[13px] tracking-[0.2em] text-muted uppercase ${className}`}>{children}</div>;
}

/** One big number with its label, rolled by an Odometer. */
export function StatNumber({
  label,
  value,
  format,
  tone = "var(--text)",
  glow,
  sub,
  unit,
  className = "",
}: {
  label: ReactNode;
  value: number;
  format?: (n: number) => string;
  /** Shown after the rolling number (kept out of the Odometer, which only rolls digits). */
  unit?: string;
  tone?: string;
  glow?: boolean;
  sub?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <StatLabel>{label}</StatLabel>
      <div
        className="mt-1 font-hud text-[40px] leading-none sm:text-[48px]"
        style={{ color: tone, textShadow: glow ? `0 0 14px color-mix(in srgb, ${tone} 55%, transparent)` : undefined }}
      >
        <Odometer value={value} format={format} />
        {unit && <span className="ml-2">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
    </div>
  );
}

/** Mastery: the percentage rolling up and a segmented Meter that gilds as it fills. */
export function MasteryStat({ mastery, label = "Mastery" }: { mastery: MasteryValue; label?: string }) {
  // Mount at 0, then fill, so the segments play `gild` on arrival.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = window.setTimeout(() => setShown(mastery.pct), 250);
    return () => window.clearTimeout(id);
  }, [mastery.pct]);
  return (
    <div className="min-w-0">
      <StatLabel>{label}</StatLabel>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-hud text-[40px] leading-none text-reward sm:text-[48px]">
          <Odometer value={mastery.pct} format={(n) => `${Math.round(n)}%`} />
        </span>
        <span className="text-sm text-muted">
          {mastery.found} of {mastery.total} answers
        </span>
      </div>
      <div className="mt-2">
        <Meter value={shown} segments={12} label={`Mastery ${mastery.pct}%`} />
      </div>
    </div>
  );
}

export type FoundRow = { key: string; label: string; icon: ReactNode; color: string; found: number; total: number };

/** `FOUND`: one row per Tier, e.g. `SHALLOWS 9/11` with a thin bar. Never colour-only: icon + name + count. */
export function FoundRows({ rows, title = "Found" }: { rows: FoundRow[]; title?: string }) {
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setFilled(true), 300);
    return () => window.clearTimeout(id);
  }, []);
  return (
    <div>
      <StatLabel>{title}</StatLabel>
      <ul className="stagger mt-2 grid gap-1.5">
        {rows.map((r, i) => {
          const pct = r.total === 0 ? 0 : (100 * r.found) / r.total;
          const done = r.total > 0 && r.found === r.total;
          return (
            <li
              key={r.key}
              style={{ "--i": i } as CSSProperties}
              className="group grid grid-cols-[22px_minmax(0,7.5rem)_1fr_auto] items-center gap-2 rounded-sm px-1 py-0.5 transition-colors hover:bg-[color-mix(in_srgb,var(--text)_6%,transparent)]"
            >
              <span className="grid place-items-center transition-transform duration-200 group-hover:scale-125" aria-hidden="true">
                {r.icon}
              </span>
              <span className="truncate font-display text-[15px] tracking-[0.12em] uppercase" style={{ color: r.color }}>
                {r.label}
              </span>
              <span className="h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--band-miss)_70%,transparent)]" aria-hidden="true">
                <span
                  className="block h-full rounded-full transition-[width] duration-1000 ease-out motion-reduce:transition-none"
                  style={{
                    width: `${filled ? pct : 0}%`,
                    transitionDelay: `${i * 90}ms`,
                    background: r.color,
                    boxShadow: done ? `0 0 8px ${r.color}` : undefined,
                  }}
                />
              </span>
              <span className="font-hud text-[20px] leading-none tabular-nums">
                {r.found}
                <span className="text-muted">/{r.total}</span>
                {done && <span className="sr-only"> (all found)</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The themed frame every Mode's stats panel sits in. */
export function StatPanel({ mode, className = "", children }: { mode: string; className?: string; children: ReactNode }) {
  return (
    <section
      data-theme={mode}
      aria-label="Your progress"
      className={`relative overflow-hidden rounded-md border border-border bg-surface p-4 text-text sm:p-5 ${className}`}
      style={{
        backgroundImage:
          "radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%), radial-gradient(90% 70% at 0% 100%, color-mix(in srgb, var(--signal) 10%, transparent), transparent 60%)",
      }}
    >
      {children}
    </section>
  );
}
