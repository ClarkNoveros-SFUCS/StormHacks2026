"use client";
// The themed hero band at the top of the Game page, one scene per Mode:
// Dive: the ocean surface with the boat (OceanStage at 0 m) · Apogee: the launch pad at dusk ·
// Leap: floating sky islands · Pairs: the card table · Blitz: neon. Hover livens each scene up,
// and `launching` (Play pressed) plays its take-off: the camera sinks, the rocket lifts, the
// hopper jumps, the cards turn, the beat doubles. Decorative only (aria-hidden).
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { OceanStage, type OceanStageHandle } from "@/components/modes/dive/OceanStage";
import type { ModeId } from "@/lib/modes";
import s from "./heroes.module.css";

type Props = { mode: ModeId; launching?: boolean; children?: ReactNode };

export function GameHero({ mode, launching = false, children }: Props) {
  return (
    <div
      className={`${s.hero} ${launching ? s.launching : ""} relative h-[230px] overflow-hidden rounded-lg border border-border sm:h-[280px]`}
      style={{ background: "#05080f" }}
    >
      <div aria-hidden="true" className="absolute inset-0">
        {mode === "dive" ? (
          <DiveScene launching={launching} />
        ) : mode === "apogee" ? (
          <ApogeeScene />
        ) : mode === "leap" ? (
          <LeapScene />
        ) : mode === "pairs" ? (
          <PairsScene />
        ) : mode === "blitz" ? (
          <BlitzScene />
        ) : (
          <div className="absolute inset-0 bg-surface-2" />
        )}
      </div>
      {/* Scrim so the title stays readable over any scene */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg, transparent 30%, rgba(5,7,15,.55) 70%, rgba(5,7,15,.9) 100%)" }}
      />
      <div className="relative flex h-full flex-col justify-end p-4 sm:p-6">{children}</div>
    </div>
  );
}

function DiveScene({ launching }: { launching: boolean }) {
  const stage = useRef<OceanStageHandle>(null);
  useEffect(() => {
    if (!launching) return;
    stage.current?.bubbles({ xFrac: 0.6, yFrac: 0.45, count: 16 });
    stage.current?.setDepth(140);
  }, [launching]);
  return <OceanStage ref={stage} depth={0} sky="dusk" />;
}

const STARS = [
  [12, 8], [30, 22], [48, 6], [70, 30], [92, 12], [110, 26], [128, 4], [150, 18], [170, 8], [188, 28],
  [204, 14], [222, 4], [244, 22], [262, 10], [280, 30], [300, 6], [314, 20], [20, 40], [84, 44], [140, 38],
];

function ApogeeScene() {
  return (
    <svg className={s.svg} viewBox="0 0 320 120" preserveAspectRatio="xMaxYMax slice">
      {["#04050d", "#080a1e", "#11123a", "#22194a", "#3b2256", "#62305e", "#8f4560"].map((c, i) => (
        <rect key={c} y={i * 16} width="320" height="17" fill={c} />
      ))}
      {STARS.map(([x, y], i) => (
        <rect key={i} className={s.twinkle} style={{ animationDelay: `${(i % 7) * 0.35}s` }} x={x} y={y} width={i % 5 ? 1 : 2} height={i % 5 ? 1 : 2} fill="#dfe8ff" />
      ))}
      {/* moon */}
      <rect x="40" y="16" width="12" height="12" fill="#f4e9c8" />
      <rect x="38" y="18" width="16" height="8" fill="#f4e9c8" />
      <rect x="44" y="18" width="3" height="3" fill="#d6c9a2" />
      {/* hills and ground */}
      <path d="M0 100 h40 v-4 h30 v-6 h24 v6 h40 v4 h186 v20 h-320z" fill="#1a1230" />
      <rect y="104" width="320" height="16" fill="#100b1f" />
      {/* pad */}
      <rect x="226" y="100" width="44" height="4" fill="#3b4675" />
      <rect x="230" y="104" width="36" height="3" fill="#2a3358" />
      {/* gantry */}
      <rect x="222" y="44" width="3" height="56" fill="#5a6488" />
      <rect x="230" y="44" width="3" height="56" fill="#5a6488" />
      {Array.from({ length: 7 }, (_, i) => (
        <rect key={i} x="222" y={46 + i * 8} width="11" height="1" fill="#5a6488" />
      ))}
      <rect x="233" y="60" width="9" height="2" fill="#5a6488" />
      <rect x="221" y="42" width="13" height="2" fill="#ff5c5c" className={s.twinkle} />
      {/* steam */}
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          className={s.steam}
          style={{ animationDelay: `${i * 0.6}s`, "--dx": `${i % 2 ? 14 : -14}px` } as CSSProperties}
          x={240 + (i % 2 ? 8 : -4)}
          y="96"
          width="8"
          height="6"
          fill="#c9d3ec"
        />
      ))}
      {/* rocket */}
      <g className={s.rocket}>
        <g className={s.rocketIdle}>
          <rect className={s.flame} x="243" y="98" width="8" height="10" fill="#ffd84d" />
          <rect className={s.flame} x="245" y="98" width="4" height="14" fill="#ff7a3d" />
          <rect x="242" y="56" width="10" height="42" fill="#e9edf6" />
          <rect x="242" y="56" width="3" height="42" fill="#c9d3ec" />
          <rect x="244" y="48" width="6" height="8" fill="#ff7a3d" />
          <rect x="246" y="44" width="2" height="4" fill="#ff7a3d" />
          <rect x="245" y="64" width="4" height="4" fill="#4de3ff" />
          <rect x="245" y="64" width="2" height="2" fill="#bff6ff" />
          <rect x="238" y="86" width="4" height="12" fill="#ff7a3d" />
          <rect x="252" y="86" width="4" height="12" fill="#ff7a3d" />
          <rect x="242" y="78" width="10" height="2" fill="#9d7bff" />
        </g>
      </g>
    </svg>
  );
}

const ISLANDS = [
  { x: 196, y: 100, w: 32 },
  { x: 236, y: 84, w: 30 },
  { x: 272, y: 68, w: 28 },
  { x: 302, y: 52, w: 22 },
];

function LeapScene() {
  return (
    <svg className={s.svg} viewBox="0 0 320 120" preserveAspectRatio="xMaxYMax slice">
      {["#1f4f86", "#2a64a0", "#3a78ad", "#4f90c4", "#68a9d8", "#7ec0e6", "#9ad3ef"].map((c, i) => (
        <rect key={c} y={i * 17} width="320" height="18" fill={c} />
      ))}
      <rect x="40" y="14" width="14" height="14" fill="#fff3b0" />
      <rect x="37" y="17" width="20" height="8" fill="#fff3b0" opacity=".6" />
      {[
        { y: 20, t: 46, d: -6, w: 30 },
        { y: 40, t: 60, d: -30, w: 22 },
        { y: 8, t: 72, d: -50, w: 26 },
      ].map((c, i) => (
        <g key={i} className={s.cloud} style={{ "--t": `${c.t}s`, animationDelay: `${c.d}s` } as CSSProperties}>
          <rect x="0" y={c.y} width={c.w} height="5" fill="#fff" opacity=".85" />
          <rect x="5" y={c.y - 3} width={c.w - 12} height="4" fill="#fff" opacity=".85" />
        </g>
      ))}
      {ISLANDS.map((isl, i) => (
        <g key={i} className={s.island} style={{ "--d": `${i * -0.9}s` } as CSSProperties}>
          <rect x={isl.x} y={isl.y} width={isl.w} height="4" fill="#3ddc97" />
          <rect x={isl.x} y={isl.y} width={isl.w} height="1" fill="#8ff0c4" />
          <rect x={isl.x + 2} y={isl.y + 4} width={isl.w - 4} height="4" fill="#9a5a2a" />
          <rect x={isl.x + 6} y={isl.y + 8} width={isl.w - 12} height="3" fill="#7a4520" />
          <rect x={isl.x + 11} y={isl.y + 11} width={isl.w - 22} height="3" fill="#5a3216" />
          {i % 2 === 0 && <rect x={isl.x + isl.w - 8} y={isl.y - 6} width="3" height="6" fill="#2a9a68" />}
        </g>
      ))}
      <g className={s.hopper}>
        <rect x="207" y="90" width="10" height="10" fill="#ffd84d" />
        <rect x="207" y="90" width="10" height="2" fill="#fff3b0" />
        <rect x="209" y="93" width="2" height="2" fill="#0b0e1d" />
        <rect x="213" y="93" width="2" height="2" fill="#0b0e1d" />
        <rect x="210" y="97" width="4" height="1" fill="#c99a1e" />
      </g>
    </svg>
  );
}

const CARDS = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 176 + (i % 3) * 40, y: 16 + Math.floor(i / 3) * 42, d: i * 0.5 + (i % 2) * 1.5 }));
const FACE_WORDS = ["BFS", "DFS", "MST", "DAG", "SSSP", "LCA"];

function PairsScene() {
  return (
    <svg className={s.svg} viewBox="0 0 320 120" preserveAspectRatio="xMaxYMid slice">
      <rect width="320" height="120" fill="#1a0f24" />
      <rect x="6" y="6" width="308" height="108" fill="#3a1f2a" />
      <rect x="10" y="10" width="300" height="100" fill="#1f5a44" />
      <rect x="10" y="10" width="300" height="100" fill="url(#felt)" />
      <defs>
        <radialGradient id="felt" cx="60%" cy="40%" r="70%">
          <stop offset="0" stopColor="#2f8a66" stopOpacity=".55" />
          <stop offset="1" stopColor="#0d2e22" stopOpacity=".8" />
        </radialGradient>
      </defs>
      {CARDS.map((c, i) => (
        <g key={i} className={s.card} style={{ "--d": `${c.d}s` } as CSSProperties}>
          <rect x={c.x} y={c.y + 2} width="28" height="38" fill="#0b0e1d" opacity=".4" />
          <rect x={c.x} y={c.y} width="28" height="38" fill={i % 2 ? "#9d7bff" : "#ff9f43"} />
          <rect x={c.x + 3} y={c.y + 3} width="22" height="32" fill="none" stroke="#fff" strokeOpacity=".45" />
          <rect x={c.x + 11} y={c.y + 16} width="6" height="6" fill="#fff" opacity=".5" />
          <g className={s.cardFace} style={{ "--d": `${c.d}s` } as CSSProperties}>
            <rect x={c.x} y={c.y} width="28" height="38" fill="#fdf6e3" />
            <text x={c.x + 14} y={c.y + 23} textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="bold" fill="#261638">
              {FACE_WORDS[i]}
            </text>
          </g>
        </g>
      ))}
      <rect x="120" y="92" width="34" height="8" fill="#ffd166" opacity=".9" />
      <rect x="124" y="94" width="26" height="4" fill="#c99a1e" />
    </svg>
  );
}

function BlitzScene() {
  return (
    <svg className={s.svg} viewBox="0 0 320 120" preserveAspectRatio="xMaxYMid slice">
      <rect width="320" height="120" fill="#0b0418" />
      <rect y="0" width="320" height="64" fill="#170a2c" />
      {/* sun */}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={226 - i * 2} y={32 + i * 6} width={48 + i * 4} height="4" fill={["#f6ff3d", "#ffb23d", "#ff7a6a", "#ff3df0", "#b23dff"][i]} />
      ))}
      {/* floor grid */}
      <rect y="64" width="320" height="2" fill="#ff3df0" />
      <g className={s.floor}>
        {[66, 72, 80, 90, 102, 116].map((y) => (
          <rect key={y} y={y} width="320" height="1" fill="#ff3df0" opacity=".55" />
        ))}
      </g>
      {Array.from({ length: 13 }, (_, i) => {
        const x = i * 26 - 6;
        return <line key={i} x1={160 + (x - 160) * 0.25} y1="64" x2={x} y2="120" stroke="#ff3df0" strokeOpacity=".4" strokeWidth="1" />;
      })}
      <rect className={s.beat} x="136" y="24" width="68" height="36" fill="none" stroke="#3dfcff" strokeWidth="2" />
      <text className={s.flashT} x="152" y="52" fontSize="28" fontFamily="monospace" fontWeight="bold" fill="#3dfcff">
        T
      </text>
      <text className={s.flashF} x="174" y="52" fontSize="28" fontFamily="monospace" fontWeight="bold" fill="#ff3df0">
        F
      </text>
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} className={s.eq} style={{ "--d": `${(i * 0.13) % 0.5}s` } as CSSProperties} x={232 + i * 9} y="68" width="6" height="28" fill={i % 2 ? "#3dfcff" : "#ff3df0"} opacity=".85" />
      ))}
    </svg>
  );
}
