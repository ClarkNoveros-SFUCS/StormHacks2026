"use client";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { burstFrom } from "@/lib/motion/particles";
import { useReducedMotion } from "@/lib/motion/reduced";
import { sfx } from "@/lib/ui/sfx";
import { spriteRects } from "./PixelSprite";

export type MascotMood = "idle" | "happy" | "sad" | "wow" | "sleep";
export type MascotReaction = "happy" | "sad" | "wow";
export type MascotHandle = {
  /** Play a short reaction (~1.4 s), then go back to idle. */
  react: (kind: MascotReaction) => void;
  /** Show a speech bubble for `ms` (default 3.5 s). */
  say: (text: string, ms?: number) => void;
};

type Props = {
  size?: number;
  /** A persistent speech bubble (e.g. an empty-state line). */
  say?: string;
  /** Force a mood (otherwise idle, with reactions and auto-sleep). */
  mood?: MascotMood;
  followCursor?: boolean;
  /** Fall asleep after this long with no pointer movement. 0 disables. */
  sleepAfterMs?: number;
  /** Bubble position. */
  bubbleSide?: "left" | "right";
  className?: string;
  ref?: Ref<MascotHandle>;
};

// The pixel anglerfish, facing left. 24×18.
// b body · B shade · l belly · m mouth · t teeth · s stalk · f fin
const BODY = [
  "........................",
  "........................",
  "........................",
  "..............s.........",
  "...............s........",
  "........bbbbbbbbs.......",
  "......bbbbbbbbbbbb......",
  ".....bbbbbbbbbbbbbb..ff.",
  "....bbbbbbbbbbbbbbbbfff.",
  "...mmmmmbbbbbbbbbbbbbff.",
  "..mtmtmmbbbbbbbbbbbBbbff",
  "..mmmmmmlbbbbbbbbbBbbbff",
  "..mtmtmmllbbbbbbbBbbbff.",
  "...mmmmllllbbbbbbBbbfff.",
  "....bbllllllbbbbbbb..ff.",
  ".....bbbllllbbbbbb......",
  ".......bbBBBBbbb........",
  ".........ff..ff.........",
];
const PAL = { b: "#4656a3", B: "#2f3a78", l: "#7d8fdc", m: "#0b0e1d", t: "#ffffff", s: "#a3aed0", f: "#ff5d8f" };
const RECTS = spriteRects(BODY, PAL);

const LINES = [
  "Blub! Click me again.",
  "Rarer answers sink deeper.",
  "I live down here. It's cozy.",
  "Did you do your Daily Dive?",
  "My lantern runs on curiosity.",
];

/**
 * The site mascot: a pixel anglerfish. Eyes follow the cursor, it blinks, its lantern glows,
 * it reacts (`ref.current.react('happy' | 'sad' | 'wow')`), talks in a speech bubble, and dozes
 * off when the page is idle. Clicking it plays a reaction and a line.
 */
export function Mascot({
  size = 96,
  say,
  mood: forced,
  followCursor = true,
  sleepAfterMs = 25000,
  bubbleSide = "right",
  className = "",
  ref,
}: Props) {
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const pupil = useRef<SVGRectElement>(null);
  const [reaction, setReaction] = useState<MascotReaction | null>(null);
  const [asleep, setAsleep] = useState(false);
  const [blink, setBlink] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const clicks = useRef(0);
  const timers = useRef<{ react?: ReturnType<typeof setTimeout>; bubble?: ReturnType<typeof setTimeout>; sleep?: ReturnType<typeof setTimeout> }>({});

  const mood: MascotMood = forced ?? (reaction ?? (asleep ? "sleep" : "idle"));

  const react = useCallback((kind: MascotReaction) => {
    clearTimeout(timers.current.react);
    setAsleep(false);
    setReaction(kind);
    timers.current.react = setTimeout(() => setReaction(null), 1400);
  }, []);
  const speak = useCallback((text: string, ms = 3500) => {
    clearTimeout(timers.current.bubble);
    setBubble(text);
    timers.current.bubble = setTimeout(() => setBubble(null), ms);
  }, []);
  useImperativeHandle(ref, () => ({ react, say: speak }), [react, speak]);

  // Blink every 2.5–6 s.
  useEffect(() => {
    if (reduced) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        loop();
      }, 2500 + Math.random() * 3500);
    };
    loop();
    return () => clearTimeout(t);
  }, [reduced]);

  // Eyes follow the pointer; idle → sleep.
  useEffect(() => {
    const armSleep = () => {
      clearTimeout(timers.current.sleep);
      if (sleepAfterMs > 0) timers.current.sleep = setTimeout(() => setAsleep(true), sleepAfterMs);
    };
    armSleep();
    const onMove = (e: PointerEvent) => {
      setAsleep((a) => (a ? false : a));
      armSleep();
      if (!followCursor || !root.current || !pupil.current) return;
      const r = root.current.getBoundingClientRect();
      // eye centre ≈ (10.5/24, 6.5/18) of the sprite box
      const ex = r.left + r.width * (10.5 / 24);
      const ey = r.top + r.height * (6.5 / 18);
      const a = Math.atan2(e.clientY - ey, e.clientX - ex);
      const d = Math.min(1, Math.hypot(e.clientX - ex, e.clientY - ey) / 120);
      const px = Math.round(Math.cos(a) * d * 1.2 * 2) / 2;
      const py = Math.round(Math.sin(a) * d * 1.2 * 2) / 2;
      pupil.current.setAttribute("transform", `translate(${px} ${py})`);
    };
    window.addEventListener("pointermove", onMove);
    const t = timers.current;
    return () => {
      window.removeEventListener("pointermove", onMove);
      clearTimeout(t.sleep);
    };
  }, [followCursor, sleepAfterMs]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.react);
      clearTimeout(t.bubble);
    };
  }, []);

  const onClick = () => {
    clicks.current += 1;
    if (clicks.current % 5 === 0) {
      react("wow");
      sfx.levelUp();
      burstFrom(root.current, { count: 30, kind: "confetti", spread: 260 });
      speak("You found my secret! ✦");
    } else {
      react("happy");
      sfx.pop();
      speak(LINES[clicks.current % LINES.length], 2600);
    }
  };

  const anim =
    reduced || forced === "sleep"
      ? undefined
      : mood === "happy"
        ? "mascot-hop .7s var(--ease-bounce) 2"
        : mood === "wow"
          ? "mascot-wow .6s var(--ease-snap)"
          : mood === "sad"
            ? "mascot-sad 1.4s ease-in-out"
            : mood === "sleep"
              ? "mascot-doze 4s ease-in-out infinite"
              : "bob 3s ease-in-out infinite";

  const text = bubble ?? say ?? null;
  const eyesClosed = blink || mood === "sleep";
  const lanternGlow = mood === "sleep" ? 0.25 : mood === "wow" ? 1 : 0.75;

  return (
    <div className={`relative inline-block select-none ${className}`} style={{ width: size }}>
      {text && (
        <div
          role="status"
          className={`absolute bottom-[88%] z-10 w-max max-w-[220px] rounded-md border-2 border-border-strong bg-surface-2 px-3 py-2 font-display text-[13px] leading-snug text-text shadow-xl ${
            bubbleSide === "right" ? "left-[55%]" : "right-[55%]"
          }`}
          style={{ animation: "pop-in .3s var(--ease-snap) both" }}
        >
          {text}
          <span
            aria-hidden="true"
            className={`absolute -bottom-[7px] h-3 w-3 rotate-45 border-r-2 border-b-2 border-border-strong bg-surface-2 ${
              bubbleSide === "right" ? "left-4" : "right-4"
            }`}
          />
        </div>
      )}
      <button
        type="button"
        onClick={onClick}
        aria-label="Lumen the anglerfish (click me)"
        className="block w-full rounded-md"
        style={{ animation: anim }}
      >
        <div ref={root}>
          <svg viewBox="0 0 24 18" width="100%" shapeRendering="crispEdges" aria-hidden="true" className="overflow-visible">
            {/* lantern glow */}
            <circle cx="13.5" cy="1.5" r="4" fill="#ffd84d" opacity={lanternGlow * 0.25} style={{ animation: reduced ? undefined : "lantern 2.4s ease-in-out infinite", transformBox: "fill-box", transformOrigin: "center" }} />
            {RECTS.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
            ))}
            {/* lantern */}
            <rect x="12" y="0" width="3" height="3" fill="#ffd84d" opacity={0.4 + lanternGlow * 0.6} />
            <rect x="13" y="0" width="1" height="1" fill="#ffffff" opacity={lanternGlow} />
            <rect x="14" y="3" width="1" height="1" fill="#a3aed0" />
            {/* eye */}
            {eyesClosed ? (
              <rect x="9" y="7" width="4" height="1" fill="#0b0e1d" />
            ) : mood === "happy" ? (
              <>
                <rect x="9" y="7" width="1" height="1" fill="#0b0e1d" />
                <rect x="10" y="6" width="2" height="1" fill="#0b0e1d" />
                <rect x="12" y="7" width="1" height="1" fill="#0b0e1d" />
              </>
            ) : (
              <>
                <rect x="9" y="5" width="4" height={mood === "wow" ? 4 : 3} fill="#ffffff" />
                <rect ref={pupil} x="10" y="6" width="2" height={mood === "wow" ? 1 : 2} fill="#0b0e1d" />
              </>
            )}
            {mood === "sad" && <rect x="9" y="9" width="1" height="2" fill="#4de3ff" style={{ animation: "float-up 1.2s reverse both" }} />}
            {/* cheek */}
            {mood === "happy" && <rect x="12" y="9" width="2" height="1" fill="#ff5d8f" opacity=".8" />}
          </svg>
        </div>
      </button>
      {mood === "sleep" && !reduced && (
        <span aria-hidden="true" className="pointer-events-none absolute top-0 right-[10%] font-display text-sm text-muted" style={{ animation: "zzz 2.4s ease-out infinite" }}>
          z<span className="text-xs">z</span>
        </span>
      )}
    </div>
  );
}
