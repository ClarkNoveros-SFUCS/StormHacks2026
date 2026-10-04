"use client";
import { useReducedMotion } from "@/lib/motion/reduced";

type Props = {
  days: number;
  /** Played today: the flame burns; otherwise it's a grey ember. */
  active?: boolean;
  size?: number;
  showCount?: boolean;
  className?: string;
};

/**
 * An animated pixel flame: three stacked layers flicker out of phase, embers float up.
 * Grey and still when the streak isn't active today.
 */
export function StreakFlame({ days, active = true, size = 28, showCount = true, className = "" }: Props) {
  const reduced = useReducedMotion();
  const anim = (dur: number, delay = 0) =>
    active && !reduced ? `flame-flicker ${dur}s ${delay}s ease-in-out infinite` : undefined;
  const outer = active ? "#ff6b2c" : "#4a5272";
  const mid = active ? "#ff9f43" : "#5d668a";
  const core = active ? "#ffd84d" : "#737ca0";
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} title={`${days}-day streak`}>
      <span className="relative inline-block" style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 12 14" width={size} height={size} shapeRendering="crispEdges" className="overflow-visible">
          <g style={{ transformOrigin: "6px 14px", animation: anim(0.9) }}>
            <path
              fill={outer}
              d="M5 0h1v1h1v2h1v1h1v1h1v2h1v4h-1v1h-1v1h-1v1H4v-1H3v-1H2v-1H1V7h1V5h1V4h1V2h1z"
            />
          </g>
          <g style={{ transformOrigin: "6px 14px", animation: anim(0.7, 0.15) }}>
            <path fill={mid} d="M6 4h1v2h1v1h1v4h-1v1h-1v1H5v-1H4v-1H3V8h1V7h1V5h1z" />
          </g>
          <g style={{ transformOrigin: "6px 14px", animation: anim(0.55, 0.3) }}>
            <path fill={core} d="M6 8h1v1h1v2h-1v1H5v-1H4V9h1V8z" />
          </g>
        </svg>
        {active && !reduced && (
          <>
            <span className="absolute left-[30%] top-0 h-[2px] w-[2px] bg-[#ffd84d]" style={{ animation: "float-up 1.4s ease-out infinite" }} />
            <span className="absolute left-[62%] top-[10%] h-[2px] w-[2px] bg-[#ff9f43]" style={{ animation: "float-up 1.8s .6s ease-out infinite" }} />
          </>
        )}
      </span>
      {showCount && (
        <span className={`font-display tabular-nums ${active ? "text-caution" : "text-faint"}`} style={{ fontSize: size * 0.6 }}>
          {days}
        </span>
      )}
    </span>
  );
}
