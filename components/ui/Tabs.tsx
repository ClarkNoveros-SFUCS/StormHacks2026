"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { sfx } from "@/lib/ui/sfx";

export type TabItem = { id: string; label: string; count?: number };

type Props = { tabs: TabItem[]; value: string; onChange: (id: string) => void; className?: string; label?: string };

/** Pixel tabs with a sliding underline. Arrow keys move between tabs (roving tabindex). */
export function Tabs({ tabs, value, onChange, className = "", label }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  const idx = Math.max(0, tabs.findIndex((t) => t.id === value));
  useLayoutEffect(() => {
    const el = refs.current[idx];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [idx, tabs]);
  const move = (d: number) => {
    const n = (idx + d + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className={`relative flex gap-1 overflow-x-auto border-b border-border ${className}`}>
      {tabs.map((t, i) => {
        const active = i === idx;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              sfx.click();
              onChange(t.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(1);
              if (e.key === "ArrowLeft") move(-1);
            }}
            className={`relative px-3 py-2.5 font-display text-sm whitespace-nowrap transition-colors ${
              active ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`ml-1.5 rounded-sm px-1.5 text-[11px] ${active ? "bg-primary text-primary-text" : "bg-surface-2 text-muted"}`}>
                {t.count}
              </span>
            )}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        className="absolute bottom-0 h-[3px] bg-primary"
        style={{ left: bar.left, width: bar.width, transition: "left .35s var(--ease-bounce), width .35s var(--ease-bounce)" }}
      />
    </div>
  );
}
