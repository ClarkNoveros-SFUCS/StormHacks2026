"use client";
import { useId, useState, type ReactNode } from "react";

type Props = { label: ReactNode; side?: "top" | "bottom"; children: ReactNode; className?: string };

/** Hover/focus tooltip. The trigger gets `aria-describedby`. Works on touch via tap (focus). */
export function Tooltip({ label, side = "top", children, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-[70] w-max max-w-[240px] -translate-x-1/2 rounded-sm border border-border-strong bg-bg-2 px-2.5 py-1.5 text-xs text-text shadow-xl ${
            side === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          style={{ animation: "pop-in .18s var(--ease-snap) both" }}
        >
          {label}
        </span>
      )}
    </span>
  );
}
