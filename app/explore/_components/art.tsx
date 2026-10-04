// Self-drawn pixel art for the Explore pages (SVG, crispEdges, CSS-animated, no assets).
// Layers read --px / --py (set by <Parallax>) for cursor parallax. All motion stops under
// prefers-reduced-motion via the global rule in app/globals.css.
import type { CSSProperties, ReactNode } from "react";
import s from "../explore.module.css";

const par = (x: number, y = x / 2): CSSProperties => ({
  transform: `translate(calc(var(--px, 0) * ${x}px), calc(var(--py, 0) * ${y}px))`,
});

/** Deterministic "random" so server and client render the same art. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0; // mulberry32
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Canopy({ y, color, seed, step = 10, h = 14 }: { y: number; color: string; seed: number; step?: number; h?: number }) {
  const r = rng(seed);
  const blobs: ReactNode[] = [];
  for (let x = -10; x < 250; x += step) {
    const bh = Math.round(h * (0.5 + r()));
    const bw = step + Math.round(r() * 8);
    blobs.push(<rect key={`a${x}`} x={x} y={y - bh} width={bw} height={bh + 60} fill={color} />);
    blobs.push(<rect key={`b${x}`} x={x + 2} y={y - bh - 3} width={bw - 4} height={3} fill={color} />);
  }
  return <>{blobs}</>;
}

const PY_BLUE = "#3776ab";
const PY_BLUE_D = "#24507d";
const PY_YELLOW = "#ffd43b";
const PY_YELLOW_D = "#c99a1e";

/** The Python: a striped pixel snake slithering along a branch, tongue flicking. */
function Snake({ x, y, segs = 16 }: { x: number; y: number; segs?: number }) {
  return (
    <g>
      {Array.from({ length: segs }, (_, i) => {
        const yellow = Math.floor(i / 2) % 2 === 1;
        return (
          <g key={i} className={s.seg} style={{ animationDelay: `${-i * 0.11}s` }}>
            <rect x={x + i * 4} y={y} width={4} height={5} fill={yellow ? PY_YELLOW : PY_BLUE} />
            <rect x={x + i * 4} y={y + 4} width={4} height={1} fill={yellow ? PY_YELLOW_D : PY_BLUE_D} />
          </g>
        );
      })}
      <g className={s.seg} style={{ animationDelay: `${-segs * 0.11}s` }}>
        <rect x={x + segs * 4} y={y - 2} width={8} height={7} fill={PY_BLUE} />
        <rect x={x + segs * 4 + 1} y={y + 4} width={7} height={1} fill={PY_BLUE_D} />
        <rect x={x + segs * 4 + 4} y={y - 1} width={2} height={2} fill="#fff" />
        <rect x={x + segs * 4 + 5} y={y} width={1} height={1} fill="#0b0e1d" />
        <g className={s.tongue}>
          <rect x={x + segs * 4 + 8} y={y + 2} width={3} height={1} fill="#ff5d8f" />
          <rect x={x + segs * 4 + 11} y={y + 1} width={1} height={1} fill="#ff5d8f" />
          <rect x={x + segs * 4 + 11} y={y + 3} width={1} height={1} fill="#ff5d8f" />
        </g>
      </g>
    </g>
  );
}

function Fireflies({ seed, n = 9, w = 240, h = 70, color = "#f6ff9a" }: { seed: number; n?: number; w?: number; h?: number; color?: string }) {
  const r = rng(seed);
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          className={s.firefly}
          style={{ animationDelay: `${-r() * 4}s, ${-r() * 5}s` }}
          x={Math.round(r() * w)}
          y={Math.round(8 + r() * h)}
          width={1}
          height={1}
          fill={color}
        />
      ))}
    </>
  );
}

type ArtProps = { className?: string; title?: string };

/** "Python Basics": a pixel jungle at dusk with a striped python on a branch. viewBox 240×90. */
export function PythonBanner({ className = "", title }: ArtProps) {
  return (
    <svg
      viewBox="0 0 240 90"
      preserveAspectRatio="xMidYMid slice"
      className={`${s.art} ${className}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {/* sky bands */}
      {["#0c1f2a", "#11303a", "#174640", "#1f5c48", "#2b7450"].map((c, i) => (
        <rect key={c} x="0" y={i * 12} width="240" height="13" fill={c} />
      ))}
      <rect x="0" y="60" width="240" height="30" fill="#2b7450" />
      {/* moon */}
      <g className={s.layer} style={par(-2)}>
        <rect x="176" y="10" width="14" height="14" fill="#fff6c8" />
        <rect x="174" y="12" width="18" height="10" fill="#fff6c8" />
        <rect x="178" y="8" width="10" height="18" fill="#fff6c8" />
        <rect x="181" y="14" width="3" height="3" fill="#ead98a" />
        <rect x="186" y="19" width="2" height="2" fill="#ead98a" />
      </g>
      {/* far canopy */}
      <g className={s.layer} style={par(2)}>
        <Canopy y={52} color="#164534" seed={7} step={12} h={16} />
      </g>
      {/* mid trees */}
      <g className={s.layer} style={par(5)}>
        {[22, 96, 150, 214].map((x) => (
          <rect key={x} x={x} y={44} width={6} height={46} fill="#3b2a1e" />
        ))}
        <Canopy y={66} color="#0f3727" seed={21} step={9} h={12} />
      </g>
      <Fireflies seed={5} />
      {/* vines */}
      <g className={s.layer} style={par(7)}>
        {[[40, 26], [70, 18], [128, 30], [200, 22]].map(([x, len], i) => (
          <g key={x} className={s.vine} style={{ animationDelay: `${-i * 1.3}s` }}>
            <rect x={x} y={0} width={1} height={len} fill="#3fa75a" />
            <rect x={x - 2} y={len * 0.4} width={2} height={2} fill="#5fd37a" />
            <rect x={x + 1} y={len * 0.7} width={2} height={2} fill="#5fd37a" />
            <rect x={x - 1} y={len} width={3} height={3} fill="#5fd37a" />
          </g>
        ))}
      </g>
      {/* branch + python */}
      <g className={s.layer} style={par(9)}>
        <rect x="-4" y="63" width="190" height="5" fill="#5a3b24" />
        <rect x="-4" y="63" width="190" height="1" fill="#7a5233" />
        <rect x="30" y="68" width="4" height="4" fill="#5a3b24" />
        <rect x="150" y="58" width="4" height="5" fill="#5a3b24" />
        <rect x="152" y="54" width="6" height="4" fill="#4cbf68" />
        <Snake x={60} y={58} />
      </g>
      {/* foreground leaves */}
      <g className={s.layer} style={par(13, 6)}>
        {[[4, 72, "#2f9a52"], [16, 78, "#3fb565"], [214, 70, "#2f9a52"], [228, 76, "#3fb565"]].map(([x, y, c], i) => (
          <g key={i} className={s.leaf} style={{ animationDelay: `${-i * 0.9}s` }}>
            <rect x={x as number} y={y as number} width={6} height={20} fill={c as string} />
            <rect x={(x as number) - 3} y={(y as number) + 4} width={12} height={4} fill={c as string} />
            <rect x={(x as number) + 2} y={(y as number) - 4} width={2} height={4} fill={c as string} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** "SQL Basics": a moonlit data lake with stacked database barrels. */
export function SqlBanner({ className = "" }: ArtProps) {
  return (
    <svg viewBox="0 0 240 90" preserveAspectRatio="xMidYMid slice" className={`${s.art} ${className}`} aria-hidden="true">
      {["#0b1230", "#101b44", "#162659", "#1d326e"].map((c, i) => (
        <rect key={c} x="0" y={i * 15} width="240" height="16" fill={c} />
      ))}
      <rect x="0" y="60" width="240" height="30" fill="#0d1a3a" />
      {[[30, 10], [90, 22], [150, 8], [205, 18], [60, 30], [120, 36]].map(([x, y], i) => (
        <rect key={i} className={s.twinkle} style={{ animationDelay: `${-i * 0.7}s` }} x={x} y={y} width={1} height={1} fill="#cfe3ff" />
      ))}
      {[80, 118, 156].map((x, i) => (
        <g key={x} className={s.floaty} style={{ animationDelay: `${-i * 1.5}s` }}>
          <rect x={x} y={34} width={30} height={30} fill="#3a5bd6" />
          <rect x={x} y={30} width={30} height={6} fill="#6f8cff" />
          {[42, 50, 58].map((y) => (
            <rect key={y} x={x} y={y} width={30} height={2} fill="#22378f" />
          ))}
          <rect x={x + 4} y={44} width={4} height={2} className={s.pulseNode} fill="#4de3ff" />
        </g>
      ))}
      <rect x="0" y="70" width="240" height="2" fill="#2a4a8a" opacity=".6" />
    </svg>
  );
}

/** "Data Structures": a glowing binary tree in a starfield. */
export function TreeBanner({ className = "" }: ArtProps) {
  const nodes: [number, number][] = [[120, 18], [80, 42], [160, 42], [60, 66], [100, 66], [140, 66], [180, 66]];
  const edges: [number, number][] = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [2, 6]];
  return (
    <svg viewBox="0 0 240 90" preserveAspectRatio="xMidYMid slice" className={`${s.art} ${className}`} aria-hidden="true">
      {["#140b2e", "#1c1040", "#241552", "#2c1a63"].map((c, i) => (
        <rect key={c} x="0" y={i * 23} width="240" height="24" fill={c} />
      ))}
      {edges.map(([a, b]) => (
        <line key={`${a}${b}`} x1={nodes[a][0]} y1={nodes[a][1]} x2={nodes[b][0]} y2={nodes[b][1]} stroke="#6d4fd1" strokeWidth="2" />
      ))}
      {nodes.map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 6} y={y - 6} width={12} height={12} fill="#9d7bff" />
          <rect x={x - 3} y={y - 3} width={6} height={6} className={s.pulseNode} style={{ animationDelay: `${-i * 0.4}s` }} fill="#f0e8ff" />
        </g>
      ))}
    </svg>
  );
}

/** "Web Basics": a pixel browser window with tags and a blinking cursor. */
export function WebBanner({ className = "" }: ArtProps) {
  return (
    <svg viewBox="0 0 240 90" preserveAspectRatio="xMidYMid slice" className={`${s.art} ${className}`} aria-hidden="true">
      {["#2a0f22", "#3a1530", "#4a1b3d", "#5a2249"].map((c, i) => (
        <rect key={c} x="0" y={i * 23} width="240" height="24" fill={c} />
      ))}
      <g className={s.floaty}>
        <rect x="60" y="16" width="120" height="62" fill="#1b1030" />
        <rect x="60" y="16" width="120" height="10" fill="#ff5d8f" />
        {[64, 70, 76].map((x) => (
          <rect key={x} x={x} y={19} width={4} height={4} fill="#1b1030" />
        ))}
        <rect x="70" y="34" width="10" height="3" fill="#ff9f43" />
        <rect x="84" y="34" width="40" height="3" fill="#eef2ff" />
        <rect x="78" y="42" width="56" height="3" fill="#4de3ff" />
        <rect x="78" y="50" width="34" height="3" fill="#3ddc97" />
        <rect x="70" y="58" width="10" height="3" fill="#ff9f43" />
        <rect className={s.cursor} x="84" y="57" width="3" height="6" fill="#ffd84d" />
      </g>
    </svg>
  );
}

/** The /explore hero: a night jungle clearing with floating books and a path into the trees. viewBox 320×120. */
export function ExploreHeroScene({ className = "" }: ArtProps) {
  return (
    <svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid slice" className={`${s.art} ${className}`} aria-hidden="true">
      {["#070a1a", "#0b1230", "#0f1a3e", "#13244a", "#183252", "#1d4255"].map((c, i) => (
        <rect key={c} x="0" y={i * 14} width="320" height="15" fill={c} />
      ))}
      <rect x="0" y="84" width="320" height="36" fill="#1d4255" />
      {Array.from({ length: 26 }, (_, i) => {
        const r = rng(i + 3);
        return (
          <rect key={i} className={s.twinkle} style={{ animationDelay: `${-r() * 3}s` }} x={Math.round(r() * 320)} y={Math.round(r() * 50)} width={1} height={1} fill="#e6ecff" />
        );
      })}
      <g className={s.drift}>
        <rect x="0" y="20" width="26" height="4" fill="#26305e" />
        <rect x="6" y="16" width="14" height="4" fill="#26305e" />
      </g>
      <g className={s.layer} style={par(2)}>
        <Canopy y={80} color="#123a36" seed={11} step={14} h={22} />
      </g>
      <g className={s.layer} style={par(5)}>
        <Canopy y={96} color="#0c2a26" seed={42} step={11} h={16} />
        {/* path */}
        <rect x="140" y="96" width="40" height="30" fill="#2a3a3a" />
        <rect x="150" y="92" width="20" height="6" fill="#2a3a3a" />
      </g>
      {/* floating books */}
      {[[60, 40, "#9d7bff"], [250, 34, "#ff5d8f"], [214, 60, "#4de3ff"], [96, 64, "#ffd84d"]].map(([x, y, c], i) => (
        <g key={i} className={s.layer} style={par(8 + i)}>
          <g className={s.floaty} style={{ animationDelay: `${-i * 1.4}s` }}>
            <rect x={x as number} y={y as number} width={14} height={10} fill={c as string} />
            <rect x={(x as number) + 6} y={y as number} width={2} height={10} fill="#0b0e1d" opacity=".35" />
            <rect x={(x as number) + 2} y={(y as number) + 2} width={3} height={1} fill="#fff" opacity=".7" />
            <rect x={(x as number) + 9} y={(y as number) + 2} width={3} height={1} fill="#fff" opacity=".7" />
          </g>
        </g>
      ))}
      <Fireflies seed={9} n={14} w={320} h={90} />
      <g className={s.layer} style={par(12, 5)}>
        <Snake x={8} y={106} segs={10} />
        <rect x="0" y="111" width="80" height="9" fill="#08201c" />
        <rect x="250" y="104" width="70" height="16" fill="#08201c" />
      </g>
    </svg>
  );
}

/** The banner art for a Course's `banner` id (falls back to the jungle python). */
export function CourseArt({ banner, className, title }: ArtProps & { banner: string | null }) {
  switch (banner) {
    case "sql":
      return <SqlBanner className={className} />;
    case "tree":
      return <TreeBanner className={className} />;
    case "web":
      return <WebBanner className={className} />;
    default:
      return <PythonBanner className={className} title={title} />;
  }
}
