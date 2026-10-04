"use client";
// Mastery before → after, for any Mode's Reveal (themed by the surrounding data-theme).
import { useEffect, useState } from "react";
import { Meter } from "@/components/ui/Meter";
import type { RevealProgress } from "@/lib/runs/types";

export function MasteryBlock({ progress, className = "" }: { progress: RevealProgress; className?: string }) {
  const [shown, setShown] = useState(progress?.masteryBefore ?? 0);
  const after = progress?.masteryAfter ?? 0;
  useEffect(() => {
    const id = setTimeout(() => setShown(after), 1200);
    return () => clearTimeout(id);
  }, [after]);
  if (!progress) return null;
  const gained = progress.masteryAfter - progress.masteryBefore;
  return (
    <section className={`w-full ${className}`}>
      <h3 className="label-line">MASTERY</h3>
      <div className="mt-3 flex items-baseline gap-3 font-hud text-[28px] sm:text-[32px]">
        <span className="text-muted tabular-nums">{progress.masteryBefore}%</span>
        <span className="text-faint">→</span>
        <span className="text-reward tabular-nums" style={{ textShadow: "0 0 12px color-mix(in srgb, var(--reward) 60%, transparent)" }}>
          {progress.masteryAfter}%
        </span>
        {gained > 0 && <span className="text-[18px] tracking-[0.15em] text-success">+{gained}</span>}
      </div>
      <div className="mt-2">
        <Meter value={shown} segments={20} label={`Mastery ${progress.masteryAfter}%`} />
      </div>
      <p className="mt-2 font-hud text-[14px] tracking-[0.2em] text-faint">
        {gained > 0 ? "NEW ANSWERS LOGGED IN YOUR NOTES" : "OF THIS GAME'S ANSWERS FOUND"}
      </p>
    </section>
  );
}
