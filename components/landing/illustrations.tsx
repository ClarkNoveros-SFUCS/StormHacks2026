// Pixel illustrations for the landing page (self-drawn SVG, crispEdges). Decorative.
import s from "./landing.module.css";

const svg = { viewBox: "0 0 80 48", shapeRendering: "crispEdges" as const, "aria-hidden": true, className: "block h-full w-full" };

/** Step 1: your files (PDF, slides, doc) slide into Lumen's lantern. */
export function UploadArt() {
  const docs = [
    { x: 6, c: "#ff5c5c", l: "PDF" },
    { x: 16, c: "#ff9f43", l: "PPT" },
    { x: 26, c: "#5aa8ff", l: "DOC" },
  ];
  return (
    <svg {...svg}>
      <rect width="80" height="48" fill="#101634" />
      <rect y="40" width="80" height="8" fill="#0b1028" />
      {docs.map((d, i) => (
        <g key={d.l} className={s.bob} style={{ animationDelay: `${i * 0.3}s` }}>
          <rect x={d.x} y={10 + i * 3} width="14" height="20" fill="#e9edf6" />
          <rect x={d.x + 9} y={10 + i * 3} width="5" height="5" fill="#b9c2da" />
          <rect x={d.x} y={24 + i * 3} width="14" height="6" fill={d.c} />
          <rect x={d.x + 2} y={14 + i * 3} width="8" height="1" fill="#9aa6c8" />
          <rect x={d.x + 2} y={17 + i * 3} width="10" height="1" fill="#9aa6c8" />
          <rect x={d.x + 2} y={20 + i * 3} width="6" height="1" fill="#9aa6c8" />
        </g>
      ))}
      <g className={s.arrow}>
        <rect x="45" y="22" width="8" height="2" fill="#ffd84d" />
        <rect x="53" y="20" width="2" height="6" fill="#ffd84d" />
        <rect x="55" y="21" width="1" height="4" fill="#ffd84d" />
      </g>
      {/* lantern */}
      <rect x="62" y="12" width="2" height="5" fill="#a3aed0" />
      <rect x="58" y="17" width="10" height="2" fill="#6b7699" />
      <rect x="59" y="19" width="8" height="12" fill="#ffd84d" className={s.blink} />
      <rect x="61" y="21" width="4" height="8" fill="#fff6c8" />
      <rect x="58" y="31" width="10" height="2" fill="#6b7699" />
    </svg>
  );
}

/** Step 2: four Mode tiles, one lit. */
export function PickModeArt() {
  const tiles = [
    { x: 8, c: "#4de3ff", g: "▼" },
    { x: 26, c: "#ff7a3d", g: "▲" },
    { x: 44, c: "#3ddc97", g: "◆" },
    { x: 62, c: "#ff9f43", g: "◧" },
  ];
  return (
    <svg {...svg}>
      <rect width="80" height="48" fill="#101634" />
      {tiles.map((t, i) => (
        <g key={t.g} className={i === 0 ? s.bob : undefined}>
          <rect x={t.x} y="12" width="12" height="20" fill="#141a33" stroke={t.c} strokeWidth={i === 0 ? 1.5 : 0.6} />
          <rect x={t.x + 2} y="14" width="8" height="8" fill={t.c} opacity={i === 0 ? 1 : 0.45} />
          <rect x={t.x + 2} y="25" width="8" height="1.5" fill="#9aa6c8" opacity=".7" />
          <rect x={t.x + 2} y="28" width="5" height="1.5" fill="#6b7699" opacity=".7" />
        </g>
      ))}
      {/* pointer */}
      <g className={s.bob} style={{ animationDelay: ".4s" }}>
        <rect x="15" y="34" width="2" height="6" fill="#ffffff" />
        <rect x="13" y="36" width="6" height="2" fill="#ffffff" />
        <rect x="14" y="40" width="4" height="2" fill="#ffd84d" />
      </g>
    </svg>
  );
}

/** Step 3: an answer sinks deeper and scores. */
export function PlayArt() {
  return (
    <svg {...svg}>
      <rect width="80" height="48" fill="#1f5a8f" />
      <rect y="14" width="80" height="12" fill="#143e6c" />
      <rect y="26" width="80" height="12" fill="#0c2547" />
      <rect y="38" width="80" height="10" fill="#07142b" />
      <rect y="13" width="80" height="1" fill="#8fa3c4" opacity=".6" />
      <rect y="25" width="80" height="1" fill="#4de3ff" opacity=".6" />
      <rect y="37" width="80" height="1" fill="#9d7bff" opacity=".7" />
      {/* the chip, sunk to the rare band */}
      <g className={s.bob}>
        <rect x="24" y="39" width="26" height="7" fill="#05070f" stroke="#ffd166" strokeWidth="1" />
        <rect x="27" y="42" width="14" height="1.5" fill="#ffd166" />
        <rect x="43" y="41" width="4" height="3" fill="#ffd166" />
      </g>
      <g className={s.floatUp}>
        <rect x="56" y="30" width="2" height="6" fill="#ffd166" />
        <rect x="54" y="32" width="6" height="2" fill="#ffd166" />
        <rect x="62" y="30" width="5" height="6" fill="none" stroke="#ffd166" strokeWidth="1.2" />
        <rect x="69" y="30" width="5" height="6" fill="none" stroke="#ffd166" strokeWidth="1.2" />
      </g>
      {[10, 66, 72].map((x, i) => (
        <rect key={x} x={x} y={20 + i * 5} width="2" height="2" fill="none" stroke="#bfe9ff" strokeWidth=".6" className={s.floatUp} style={{ animationDelay: `${i * 0.5}s` }} />
      ))}
    </svg>
  );
}

/** The Python Basics course banner: a pixel snake on a teal field. */
export function PythonBanner() {
  return (
    <svg viewBox="0 0 120 48" shapeRendering="crispEdges" aria-hidden="true" className="block h-full w-full">
      <rect width="120" height="48" fill="#0f2e3a" />
      <rect y="34" width="120" height="14" fill="#0b2430" />
      {[8, 30, 92, 110].map((x, i) => (
        <rect key={x} x={x} y={6 + (i % 2) * 6} width="1" height="1" fill="#7af0ff" opacity=".7" />
      ))}
      <g className={s.bob}>
        {/* blue half */}
        <rect x="40" y="10" width="20" height="6" fill="#3d7bd9" />
        <rect x="36" y="16" width="8" height="12" fill="#3d7bd9" />
        <rect x="44" y="22" width="16" height="6" fill="#3d7bd9" />
        <rect x="44" y="12" width="2" height="2" fill="#ffffff" />
        {/* yellow half */}
        <rect x="60" y="22" width="8" height="12" fill="#ffd84d" />
        <rect x="52" y="28" width="8" height="6" fill="#ffd84d" />
        <rect x="56" y="34" width="20" height="6" fill="#ffd84d" />
        <rect x="70" y="36" width="2" height="2" fill="#1a1405" />
      </g>
      <rect x="84" y="14" width="22" height="3" fill="#3ddc97" opacity=".8" />
      <rect x="84" y="20" width="16" height="3" fill="#9aa6c8" opacity=".6" />
      <rect x="84" y="26" width="19" height="3" fill="#9aa6c8" opacity=".6" />
      <rect x="10" y="18" width="18" height="3" fill="#ff5d8f" opacity=".7" />
      <rect x="10" y="24" width="12" height="3" fill="#9aa6c8" opacity=".6" />
    </svg>
  );
}
