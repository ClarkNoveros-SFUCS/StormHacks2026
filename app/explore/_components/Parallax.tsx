"use client";
import { useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";

/**
 * Sets --px / --py (−1…1) from the cursor position over this box, so pixel-art layers inside
 * can shift by different amounts (see art.tsx `par()`). Nothing moves under reduced motion or touch.
 */
export function Parallax({ className = "", children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const reduced = useReducedMotion();
  const set = (x: number, y: number) => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      ref.current?.style.setProperty("--px", x.toFixed(3));
      ref.current?.style.setProperty("--py", y.toFixed(3));
    });
  };
  return (
    <div
      ref={ref}
      className={className}
      onPointerMove={(e) => {
        if (reduced || e.pointerType === "touch") return;
        const r = e.currentTarget.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width - 0.5) * 2, ((e.clientY - r.top) / r.height - 0.5) * 2);
      }}
      onPointerLeave={() => set(0, 0)}
    >
      {children}
    </div>
  );
}
