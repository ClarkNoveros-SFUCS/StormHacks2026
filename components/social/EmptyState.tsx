import type { ReactNode } from "react";
import { Mascot } from "@/components/ui";

/**
 * Lumen (the anglerfish) beside a speech bubble, plus a title and an optional action: every
 * empty list on the social pages. The bubble is ours (not Mascot's `say`) so it never overflows
 * a 375 px screen.
 */
export function EmptyState({ say, title, children, className = "" }: { say: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-4 rounded-md border border-dashed border-border-strong bg-bg-2/80 px-4 py-7 text-center ${className}`}>
      <div className="flex max-w-md items-end gap-3 text-left">
        <Mascot size={72} sleepAfterMs={0} className="shrink-0" />
        <p
          className="relative mb-8 rounded-md border-2 border-border-strong bg-surface-2 px-3 py-2 font-display text-[13px] leading-snug text-text shadow-xl"
          style={{ animation: "pop-in .4s var(--ease-snap) both" }}
        >
          {say}
          <span aria-hidden="true" className="absolute -left-[7px] bottom-3 h-3 w-3 rotate-45 border-b-2 border-l-2 border-border-strong bg-surface-2" />
        </p>
      </div>
      <p className="font-display text-lg text-text">{title}</p>
      {children}
    </div>
  );
}
