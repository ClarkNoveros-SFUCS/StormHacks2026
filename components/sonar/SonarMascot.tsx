"use client";
import { useReducedMotion } from "@/lib/motion/reduced";
import { spriteRects } from "@/components/ui/PixelSprite";
import s from "./sonar.module.css";

export type SonarMood = "idle" | "thinking" | "talking" | "happy";

// Sonar, the baby pixel dolphin (F32), facing right. 24×16, same palette family as Lumen.
// b body · B shade/fins · l belly · d dark outline accents
const BODY = [
  "........................",
  "...........BB...........",
  "..........BBb...........",
  ".......bbbbbbbbbb.......",
  ".....bbbbbbbbbbbbbb.....",
  "B...bbbbbbbbbbbbbbbbb...",
  "BB..bbbbbbbbbbbbbbbbbb..",
  "BBB.bbbbbbbbbbbbbbbbbbbb",
  ".BBBbbbbbbbbbbbbbbbbllll",
  "..BBbbbbllllllllllllll..",
  ".BB.bbblllllllllllll....",
  "B....bbbllllllllll......",
  ".......bbbbbBBb.........",
  "...........BBB..........",
  "............B...........",
  "........................",
];
const PAL = { b: "#5aa2e8", B: "#3a5fb0", l: "#cfe6ff" };
const RECTS = spriteRects(BODY, PAL);

type Props = {
  mood?: SonarMood;
  /** Rendered width in px. Reads well from 40 to 160. */
  size?: number;
  className?: string;
  /** Accessible name; omit when a parent already labels it. */
  label?: string;
};

/**
 * Sonar the baby dolphin. `idle` bobs, `thinking` sends sonar ping rings out of its melon,
 * `talking` bounces with a flapping mouth, `happy` hops with closed eyes and blush.
 * Reduced motion: still pose (rings stay drawn while thinking so the state still reads).
 */
export function SonarMascot({ mood = "idle", size = 120, className = "", label }: Props) {
  const reduced = useReducedMotion();
  const motion = reduced
    ? ""
    : mood === "thinking"
      ? s.think
      : mood === "talking"
        ? s.talk
        : mood === "happy"
          ? s.happy
          : s.bob;
  const happy = mood === "happy";
  return (
    <span
      className={`relative inline-block select-none ${className}`}
      style={{ width: size, height: (size * 16) / 24 }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg
        viewBox="0 0 24 16"
        width={size}
        height={(size * 16) / 24}
        shapeRendering="crispEdges"
        className={`block overflow-visible ${motion}`}
      >
        {mood === "thinking" &&
          [0, 0.6, 1.2].map((d) => (
            <circle
              key={d}
              cx="21"
              cy="5"
              r="7"
              fill="none"
              stroke="var(--signal)"
              strokeWidth="0.6"
              shapeRendering="geometricPrecision"
              className={s.ring}
              style={{ animationDelay: `${d}s`, opacity: reduced ? 0.35 + d * 0.3 : undefined, transform: reduced ? `scale(${0.4 + d * 0.4})` : undefined }}
            />
          ))}
        {RECTS.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
        ))}
        {/* highlight on the melon */}
        <rect x="14" y="4" width="2" height="1" fill="#ffffff" opacity=".55" />
        {/* eye */}
        {happy ? (
          <>
            <rect x="16" y="6" width="1" height="1" fill="#0b0e1d" />
            <rect x="17" y="5" width="1" height="1" fill="#0b0e1d" />
            <rect x="18" y="6" width="1" height="1" fill="#0b0e1d" />
          </>
        ) : (
          <>
            <rect x="16" y="5" width="3" height="3" fill="#0b0e1d" />
            <rect x="16" y="5" width="1" height="1" fill="#ffffff" />
            <rect x="18" y="7" width="1" height="1" fill="#4de3ff" opacity=".6" />
          </>
        )}
        {/* cheek */}
        <rect x="17" y="8" width="2" height="1" fill="#ff5d8f" opacity={happy ? 0.9 : 0.55} />
        {/* smile / mouth */}
        <rect x="20" y="8" width="4" height="1" fill="#1f3470" opacity=".7" />
        {mood === "talking" && <rect x="21" y="8" width="2" height="2" fill="#1f3470" className={reduced ? undefined : s.mouth} />}
        {/* blowhole sparkle when happy */}
        {happy && <rect x="12" y="1" width="1" height="1" fill="#4de3ff" />}
      </svg>
    </span>
  );
}
