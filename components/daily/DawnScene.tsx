"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion";

// The Daily hub's hero: a pixel ocean at dawn. Posterized sky bands, a sun rising off the
// horizon, drifting clouds, birds, the dive boat bobbing, a shimmering sun road on the sea.
// Pure SVG (crispEdges, 192×96 "pixels"), CSS animation, cursor parallax. Decorative only.

const W = 192;
const H = 96;
const HORIZON = 60;

const SKY = ["#120f2e", "#1a1540", "#261a4f", "#38205a", "#4f2860", "#6e3366", "#94416a", "#c0566c", "#e8706c", "#ff9470", "#ffb67c", "#ffd391"];
const SEA = ["#5a3a6e", "#3d2b60", "#2b2352", "#1e1c45", "#161838", "#10132c", "#0b0e22", "#080a1a"];

/** Rows of a pixel disc, centred on (cx, cy): [y, x0, width]. */
function disc(cx: number, cy: number, r: number): [number, number, number][] {
  const rows: [number, number, number][] = [];
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
    rows.push([cy + dy, cx - half, half * 2 + 1]);
  }
  return rows;
}

const SUN = disc(132, HORIZON, 13);

const CLOUD = [
  "....xxxx........",
  "..xxxxxxxx.xxx..",
  ".xxxxxxxxxxxxxx.",
  "xxxxxxxxxxxxxxxx",
  ".ssssssssssssss.",
];

function Cloud({ x, y, scale = 1, light, shade }: { x: number; y: number; scale?: number; light: string; shade: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {CLOUD.flatMap((row, ry) =>
        [...row].map((c, rx) => (c === "." ? null : <rect key={`${rx}-${ry}`} x={rx} y={ry} width="1.02" height="1.02" fill={c === "s" ? shade : light} />)),
      )}
    </g>
  );
}

const BOAT = [
  "......m.......",
  "......mf......",
  "......mff.....",
  "......mfff....",
  "hhhhhhhhhhhhhh",
  ".hhhhhhhhhhhh.",
  "..hhhhhhhhhh..",
];
const BOAT_PAL: Record<string, string> = { m: "#0b0e1d", f: "#ff5d8f", h: "#0b0e1d" };

const STARS = [
  [12, 4],
  [30, 9],
  [52, 3],
  [76, 7],
  [98, 2],
  [150, 5],
  [170, 10],
  [184, 3],
  [118, 11],
  [8, 14],
];

type Props = {
  className?: string;
  /** Content laid over the scene (the hero text). */
  children?: ReactNode;
};

export function DawnScene({ className = "", children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const my = ((e.clientY - r.top) / r.height) * 2 - 1;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--mx", Math.max(-1, Math.min(1, mx)).toFixed(3));
        el.style.setProperty("--my", Math.max(-1, Math.min(1, my)).toFixed(3));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, [reduced]);

  const par = (k: number) => ({ transform: `translate(calc(var(--mx, 0) * ${k}px), calc(var(--my, 0) * ${k * 0.4}px))`, transition: "transform .4s ease-out" });
  const band = HORIZON / SKY.length;
  const seaBand = (H - HORIZON) / SEA.length;

  return (
    <div ref={ref} className={`relative isolate overflow-hidden ${className}`}>
      <svg
        aria-hidden="true"
        className="absolute inset-0 -z-10 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        shapeRendering="crispEdges"
      >
        {/* sky */}
        {SKY.map((c, i) => (
          <rect key={c} x="0" y={i * band} width={W} height={band + 0.2} fill={c} />
        ))}
        {/* dithered seams between bands */}
        {SKY.slice(1).map((c, i) =>
          Array.from({ length: W / 4 }, (_, k) => <rect key={`${i}-${k}`} x={k * 4 + ((i % 2) * 2)} y={(i + 1) * band - 1} width="1" height="1" fill={c} />),
        )}
        {/* stars fading into dawn */}
        {STARS.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="1" height="1" fill="#fff6d8" style={{ animation: `dawn-twinkle ${2.2 + (i % 4) * 0.6}s ${i * 0.3}s ease-in-out infinite` }} />
        ))}

        {/* the sun's glow, then the sun rising */}
        <g style={par(3)}>
          <circle cx="132" cy={HORIZON} r="34" fill="url(#dawn-glow)" shapeRendering="auto" />
          <g style={{ animation: "dawn-rise 4.5s cubic-bezier(.22,1,.36,1) both" }}>
            {SUN.map(([y, x, w]) => (
              <rect key={y} x={x} y={y} width={w} height="1.02" fill={y < HORIZON - 7 ? "#fff1b0" : y < HORIZON - 2 ? "#ffd84d" : "#ffb347"} />
            ))}
          </g>
        </g>

        {/* far clouds and birds */}
        <g style={par(6)}>
          <g style={{ animation: "dawn-drift 70s linear infinite" }}>
            <Cloud x={20} y={18} light="#ff9f8a" shade="#c45a72" />
            <Cloud x={150} y={28} scale={0.75} light="#ffb08a" shade="#cf6a72" />
          </g>
          <g style={{ animation: "dawn-drift 46s -12s linear infinite" }}>
            <Cloud x={84} y={36} scale={0.6} light="#ffc49a" shade="#e07a76" />
          </g>
          {[
            [60, 22, 0],
            [67, 25, 0.25],
            [74, 21, 0.5],
          ].map(([x, y, d]) => (
            <g key={x} transform={`translate(${x} ${y})`}>
              <g style={{ animation: `dawn-flap .6s ${d}s steps(2) infinite` }}>
                <rect x="0" y="0" width="1" height="1" fill="#2a1840" />
                <rect x="1" y="1" width="1" height="1" fill="#2a1840" />
                <rect x="2" y="0" width="1" height="1" fill="#2a1840" />
              </g>
            </g>
          ))}
        </g>

        {/* far island */}
        <g style={par(2)} fill="#2a1d4a">
          <rect x="4" y={HORIZON - 3} width="22" height="3" />
          <rect x="8" y={HORIZON - 5} width="12" height="2" />
          <rect x="11" y={HORIZON - 6} width="5" height="1" />
          <rect x="174" y={HORIZON - 2} width="18" height="2" />
          <rect x="179" y={HORIZON - 3} width="8" height="1" />
        </g>

        {/* sea */}
        {SEA.map((c, i) => (
          <rect key={c} x="0" y={HORIZON + i * seaBand} width={W} height={seaBand + 0.2} fill={c} />
        ))}
        {/* the sun road: shimmering dashes under the sun, narrowing with depth */}
        <g style={par(2)}>
          {Array.from({ length: 12 }, (_, i) => {
            const y = HORIZON + 1 + i * 3;
            const w = Math.max(3, 26 - i * 2);
            return (
              <rect
                key={i}
                x={132 - w / 2 + ((i * 7) % 5) - 2}
                y={y}
                width={w}
                height="1"
                fill={i < 3 ? "#ffd84d" : i < 7 ? "#ff9f6a" : "#c0566c"}
                style={{ animation: `dawn-shimmer ${1.6 + (i % 3) * 0.5}s ${i * 0.17}s ease-in-out infinite` }}
              />
            );
          })}
        </g>
        {/* waves */}
        <g style={par(4)}>
          {Array.from({ length: 5 }, (_, row) => (
            <g key={row} style={{ animation: `dawn-wave ${5 + row * 2}s linear infinite${row % 2 ? " reverse" : ""}` }}>
              {Array.from({ length: 16 }, (_, k) => (
                <rect key={k} x={k * 14 + ((row * 5) % 14) - 14} y={HORIZON + 4 + row * 7} width={3 + (row % 3)} height="1" fill="#8a6ab0" opacity={0.55 - row * 0.08} />
              ))}
            </g>
          ))}
        </g>
        {/* the dive boat */}
        <g style={par(5)}>
          <g transform={`translate(52 ${HORIZON - 5})`}>
            <g style={{ animation: "dawn-bob 3.2s ease-in-out infinite" }}>
              {BOAT.flatMap((row, ry) =>
                [...row].map((c, rx) => (c === "." ? null : <rect key={`${rx}-${ry}`} x={rx} y={ry} width="1.02" height="1.02" fill={BOAT_PAL[c]} />)),
              )}
            </g>
          </g>
        </g>

        <defs>
          <radialGradient id="dawn-glow">
            <stop offset="0%" stopColor="#ffd391" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#ff8a6a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff8a6a" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
      {/* a scrim at the left so the hero text reads */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(10,13,28,.72),rgba(10,13,28,.35)_45%,transparent_75%)]" />
      {children}
      <style>{`
        @keyframes dawn-rise { from { transform: translateY(10px); } }
        @keyframes dawn-drift { from { transform: translateX(-60px); } to { transform: translateX(240px); } }
        @keyframes dawn-flap { 50% { transform: translateY(1px) scaleY(.5); } }
        @keyframes dawn-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(1px); } }
        @keyframes dawn-shimmer { 0%, 100% { opacity: 1; } 50% { opacity: .35; } }
        @keyframes dawn-wave { from { transform: translateX(0); } to { transform: translateX(14px); } }
        @keyframes dawn-twinkle { 0%, 100% { opacity: .9; } 50% { opacity: .2; } }
      `}</style>
    </div>
  );
}
