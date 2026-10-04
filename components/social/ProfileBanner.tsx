import type { CSSProperties, ReactNode } from "react";
import type { BannerId } from "./banners";
import s from "./banner.module.css";

// The wide pixel-art banner on a profile (F26, decisions §2, §14): one animated scene per
// theme, drawn as a 240×60 SVG with crispEdges and scaled to cover. CSS animations only, so
// it renders on the server and goes still under reduced motion.

const W = 240;
const H = 60;

/** Deterministic pseudo-random numbers so server and client draw the same scene. */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

const t = (dur: number, delay = 0): CSSProperties => ({ ["--dur" as string]: `${dur}s`, ["--delay" as string]: `${delay}s` });

function Bands({ colors }: { colors: string[] }) {
  const h = H / colors.length;
  return (
    <>
      {colors.map((c, i) => (
        <rect key={c + i} x={0} y={i * h} width={W} height={h + 0.5} fill={c} />
      ))}
    </>
  );
}

function Fish({ y, color, dir, dur, delay, size = 1 }: { y: number; color: string; dir: 1 | -1; dur: number; delay: number; size?: number }) {
  // 6×3 pixel fish facing right; mirrored for swimming left.
  const body = (
    <g transform={`scale(${size})`}>
      <rect x={0} y={1} width={1} height={1} fill={color} />
      <rect x={1} y={0} width={1} height={3} fill={color} opacity={0.7} />
      <rect x={2} y={0} width={3} height={3} fill={color} />
      <rect x={5} y={1} width={1} height={1} fill={color} />
      <rect x={4} y={1} width={1} height={1} fill="#0b0e1d" />
    </g>
  );
  return (
    <g transform={`translate(0 ${y})`}>
      <g className={`${s.anim} ${dir === 1 ? s.swimRight : s.swimLeft}`} style={t(dur, delay)}>
        {dir === 1 ? body : <g transform="translate(6 0) scale(-1 1)">{body}</g>}
      </g>
    </g>
  );
}

function Ocean() {
  const r = rng(7);
  const bubbles = Array.from({ length: 14 }, (_, i) => ({ x: Math.floor(r() * W), d: 5 + r() * 6, delay: -r() * 10, big: i % 4 === 0 }));
  const kelp = Array.from({ length: 9 }, () => ({ x: Math.floor(r() * W), h: 10 + Math.floor(r() * 16), delay: -r() * 4 }));
  const wave = (
    <>
      {Array.from({ length: 40 }, (_, i) => (
        <rect key={i} x={i * 12} y={i % 2 ? 1 : 0} width={7} height={1} fill="#7af0ff" opacity={0.5} />
      ))}
    </>
  );
  return (
    <>
      <Bands colors={["#1a6fb0", "#145c9a", "#104b84", "#0c3c6e", "#092f59", "#072446"]} />
      {/* light shafts */}
      {[30, 95, 170, 215].map((x, i) => (
        <polygon key={x} points={`${x},0 ${x + 10},0 ${x + 30},${H} ${x + 16},${H}`} fill="#bff6ff" className={`${s.anim} ${s.shimmer}`} style={t(5 + i, -i)} />
      ))}
      <g className={`${s.anim} ${s.scroll}`} style={t(14)}>
        {wave}
      </g>
      <Fish y={18} color="#ffd84d" dir={1} dur={16} delay={-3} />
      <Fish y={24} color="#ffd84d" dir={1} dur={16} delay={-3.6} />
      <Fish y={21} color="#ffd84d" dir={1} dur={16} delay={-4.2} />
      <Fish y={34} color="#ff5d8f" dir={-1} dur={22} delay={-9} size={1.3} />
      <Fish y={12} color="#4de3ff" dir={-1} dur={28} delay={-15} />
      {bubbles.map((b, i) => (
        <rect key={i} x={b.x} y={H - 6} width={b.big ? 2 : 1} height={b.big ? 2 : 1} fill="#bff6ff" className={`${s.anim} ${s.rise}`} style={t(b.d, b.delay)} />
      ))}
      {kelp.map((k, i) => (
        <g key={i} className={`${s.anim} ${s.sway}`} style={t(3.5 + (i % 3), k.delay)}>
          <rect x={k.x} y={H - 4 - k.h} width={2} height={k.h} fill="#1f8f5f" />
          <rect x={k.x + 2} y={H - 4 - k.h + 3} width={1} height={2} fill="#3ddc97" />
          <rect x={k.x - 1} y={H - 4 - k.h + 8} width={1} height={2} fill="#3ddc97" />
        </g>
      ))}
      <rect x={0} y={H - 4} width={W} height={4} fill="#c9a26b" />
      <rect x={0} y={H - 4} width={W} height={1} fill="#e3c38e" />
      {[20, 60, 130, 190].map((x) => (
        <rect key={x} x={x} y={H - 3} width={3} height={1} fill="#9a7a4a" />
      ))}
    </>
  );
}

function Space() {
  const r = rng(42);
  const stars = Array.from({ length: 46 }, () => ({ x: Math.floor(r() * W), y: Math.floor(r() * (H - 2)), big: r() > 0.85, d: 1.5 + r() * 3, delay: -r() * 4 }));
  return (
    <>
      <Bands colors={["#05061a", "#0a0a26", "#120b33", "#1a0f40", "#21124a", "#2a1655"]} />
      {/* nebula haze */}
      <ellipse cx={70} cy={40} rx={60} ry={14} fill="#9d7bff" opacity={0.12} />
      <ellipse cx={160} cy={18} rx={50} ry={10} fill="#ff5d8f" opacity={0.08} />
      {stars.map((st, i) => (
        <rect key={i} x={st.x} y={st.y} width={st.big ? 2 : 1} height={st.big ? 2 : 1} fill={i % 7 === 0 ? "#ffd84d" : "#ffffff"} className={`${s.anim} ${s.twinkle}`} style={t(st.d, st.delay)} />
      ))}
      {/* shooting star */}
      <g className={`${s.anim} ${s.shoot}`} style={t(7, -2)}>
        <rect x={200} y={6} width={6} height={1} fill="#ffffff" />
        <rect x={206} y={5} width={4} height={1} fill="#ffffff" opacity={0.5} />
      </g>
      {/* ringed planet */}
      <g className={`${s.anim} ${s.bob}`} style={t(6)}>
        <rect x={188} y={18} width={16} height={20} fill="#ff9f43" />
        <rect x={185} y={21} width={22} height={14} fill="#ff9f43" />
        <rect x={188} y={22} width={16} height={3} fill="#e0561f" />
        <rect x={186} y={30} width={20} height={2} fill="#e0561f" />
        <rect x={190} y={19} width={4} height={3} fill="#ffd0a0" />
        <rect x={176} y={27} width={40} height={2} fill="#ffd84d" />
        <rect x={180} y={26} width={32} height={1} fill="#c99a1e" />
      </g>
      {/* drifting rocket */}
      <g transform="translate(0 40)">
        <g className={`${s.anim} ${s.swimRight}`} style={t(30, -12)}>
          <rect x={0} y={1} width={7} height={3} fill="#d6deef" />
          <rect x={7} y={2} width={2} height={1} fill="#d6deef" />
          <rect x={4} y={2} width={1} height={1} fill="#4de3ff" />
          <rect x={1} y={0} width={2} height={1} fill="#ff5c5c" />
          <rect x={1} y={4} width={2} height={1} fill="#ff5c5c" />
          <rect x={-2} y={2} width={2} height={1} fill="#ffd84d" />
          <rect x={-3} y={2} width={1} height={1} fill="#ff9f43" className={`${s.anim} ${s.twinkle}`} style={t(0.4)} />
        </g>
      </g>
      {/* moon surface */}
      <rect x={0} y={H - 5} width={W} height={5} fill="#3b4675" />
      <rect x={0} y={H - 5} width={W} height={1} fill="#5e6a8a" />
      {[18, 80, 150, 222].map((x) => (
        <rect key={x} x={x} y={H - 3} width={5} height={1} fill="#2a3358" />
      ))}
    </>
  );
}

function Cloud({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={3} y={0} width={8} height={2} fill="#ffffff" />
      <rect x={1} y={2} width={16} height={3} fill="#ffffff" />
      <rect x={0} y={4} width={20} height={2} fill="#ffffff" />
      <rect x={0} y={6} width={20} height={1} fill="#d6eaff" />
    </g>
  );
}

function Bird({ y, dur, delay }: { y: number; dur: number; delay: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <g className={`${s.anim} ${s.swimRight}`} style={t(dur, delay)}>
        <g className={`${s.anim} ${s.flap}`} style={t(0.5)}>
          <rect x={0} y={0} width={1} height={1} fill="#1a2350" />
          <rect x={1} y={1} width={1} height={1} fill="#1a2350" />
          <rect x={2} y={0} width={1} height={1} fill="#1a2350" />
        </g>
      </g>
    </g>
  );
}

function Sky() {
  const clouds = (
    <>
      <Cloud x={10} y={8} />
      <Cloud x={70} y={18} />
      <Cloud x={140} y={6} />
      <Cloud x={200} y={22} />
    </>
  );
  return (
    <>
      <Bands colors={["#3fa9ff", "#56b6ff", "#6ec3ff", "#88cfff", "#a2dbff", "#bce6ff"]} />
      <circle cx={34} cy={14} r={14} fill="#fff6c2" className={`${s.anim} ${s.pulse}`} style={t(4)} />
      <rect x={28} y={8} width={12} height={12} fill="#ffd84d" />
      <rect x={26} y={10} width={16} height={8} fill="#ffd84d" />
      <rect x={30} y={10} width={3} height={3} fill="#fff6c2" />
      <g className={`${s.anim} ${s.scroll}`} style={t(60)}>
        {clouds}
        <g transform={`translate(${W} 0)`}>{clouds}</g>
      </g>
      <Bird y={14} dur={18} delay={-4} />
      <Bird y={18} dur={18} delay={-4.5} />
      <Bird y={11} dur={24} delay={-14} />
      {/* hills */}
      <rect x={0} y={44} width={70} height={16} fill="#2fb87a" />
      <rect x={10} y={40} width={50} height={4} fill="#2fb87a" />
      <rect x={22} y={37} width={26} height={3} fill="#2fb87a" />
      <rect x={60} y={48} width={110} height={12} fill="#3ddc97" />
      <rect x={80} y={44} width={70} height={4} fill="#3ddc97" />
      <rect x={160} y={42} width={80} height={18} fill="#2fb87a" />
      <rect x={178} y={38} width={50} height={4} fill="#2fb87a" />
      <rect x={0} y={55} width={W} height={5} fill="#1f8f5f" />
      {[16, 40, 100, 120, 190, 214].map((x, i) => (
        <rect key={x} x={x} y={i % 2 ? 51 : 47} width={1} height={1} fill="#ffd84d" />
      ))}
    </>
  );
}

const SCENES: Record<BannerId, () => ReactNode> = { ocean: Ocean, space: Space, sky: Sky };

export function ProfileBanner({ theme, className = "" }: { theme: BannerId; className?: string }) {
  const Scene = SCENES[theme];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className={`block h-full w-full ${className}`}
    >
      <Scene />
    </svg>
  );
}
