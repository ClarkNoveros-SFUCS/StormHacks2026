import { MODE_UI } from "@/lib/ui/modes";
import type { ModeId } from "@/lib/modes";
import s from "./modules.module.css";

// A small deterministic pixel scene per Module: a night strip tinted by the Module's id, a stack of
// pages that grows with its files, and a flag per Game Mode it has. Pure SVG, no state.

const TINTS = ["#4de3ff", "#9d7bff", "#ff5d8f", "#ffd166", "#3ddc97", "#ff9f43"];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 10000) / 10000;
  };
}

export function moduleTint(id: string) {
  return TINTS[hash(id) % TINTS.length];
}

export function ModuleBanner({ id, fileCount, modes }: { id: string; fileCount: number; modes: ModeId[] }) {
  const tint = moduleTint(id);
  const r = rand(hash(id));
  const stars = Array.from({ length: 10 }, () => ({
    x: Math.floor(r() * 160),
    y: Math.floor(r() * 30),
    o: 0.3 + r() * 0.6,
  }));
  const pages = Math.min(fileCount, 5);
  const moonX = 110 + Math.floor(r() * 36);
  return (
    <svg
      viewBox="0 0 160 56"
      className={`${s.banner} block h-full w-full`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="160" height="56" fill="#0a0d1c" />
      <rect y="14" width="160" height="14" style={{ fill: `color-mix(in srgb, ${tint} 10%, #0a0d1c)` }} />
      <rect y="28" width="160" height="12" style={{ fill: `color-mix(in srgb, ${tint} 20%, #0a0d1c)` }} />
      {stars.map((st, i) => (
        <rect key={i} x={st.x} y={st.y} width="1" height="1" fill="#eef2ff" opacity={st.o} />
      ))}
      <rect x={moonX} y="6" width="8" height="8" fill="#eef2ff" opacity=".85" />
      <rect
        x={moonX + 2}
        y="6"
        width="6"
        height="6"
        style={{ fill: `color-mix(in srgb, ${tint} 10%, #0a0d1c)` }}
        opacity=".9"
      />
      {/* sea */}
      <rect y="40" width="160" height="16" fill="#0d1a3a" />
      <g className={s.waves}>
        {Array.from({ length: 22 }, (_, i) => (
          <rect key={i} x={i * 8 - 8} y={40 + (i % 2)} width="4" height="1" fill={tint} opacity=".45" />
        ))}
      </g>
      {/* island with the page stack */}
      <rect x="10" y="38" width="44" height="4" fill="#1b2242" />
      <rect x="14" y="36" width="36" height="2" fill="#2a3358" />
      <g style={{ animation: "float 5s ease-in-out infinite" }}>
        {Array.from({ length: pages }, (_, i) => (
          <g key={i}>
            <rect x={20 + (i % 2)} y={30 - i * 4} width="16" height="5" fill="#d6deef" />
            <rect x={22 + (i % 2)} y={31 - i * 4} width="10" height="1" fill="#8d98b5" />
            <rect x={20 + (i % 2)} y={34 - i * 4} width="16" height="1" fill="#8d98b5" />
          </g>
        ))}
        {pages === 0 && <rect x="24" y="30" width="8" height="6" fill="none" stroke="#6b7699" strokeDasharray="1 1" />}
      </g>
      {/* a flag per Mode */}
      {modes.slice(0, 5).map((m, i) => (
        <g
          key={m}
          style={{
            animation: `bob ${2.4 + i * 0.3}s ease-in-out ${i * 0.2}s infinite`,
            transformBox: "fill-box",
            transformOrigin: "bottom",
          }}
        >
          <rect x={60 + i * 16} y="24" width="1" height="16" fill="#9aa6c8" />
          <rect x={61 + i * 16} y="24" width="8" height="5" fill={MODE_UI[m].accent} />
        </g>
      ))}
    </svg>
  );
}
