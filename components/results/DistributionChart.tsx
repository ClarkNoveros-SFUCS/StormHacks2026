type Props = {
  /** Scores of past Runs (Module Games) or of today's players (Daily, Courses). */
  values: number[];
  you: number;
  max?: number;
  /** e.g. "BETTER THAN 6% OF TODAY'S PLAYERS" or "YOUR LAST 12 DIVES" */
  caption: string;
  /** Personal Best, marked on the axis in reward. */
  best?: number | null;
  /** Optional weight per value (e.g. players per histogram bucket). Default 1 each. */
  weights?: number[];
  /** Below this many values (total weight) the curve is skipped and only the caption shows (default 3). */
  minValues?: number;
  /** A second, quieter line under the caption. */
  subcaption?: string;
  className?: string;
};

const W = 560;
const H = 150;
const PAD_B = 22;

/** Smoothed (Gaussian KDE) distribution of scores with YOU marked. Pure, exported for tests. */
export function kde(values: number[], max: number, samples = 100, weights?: number[]): number[] {
  const bw = Math.max(12, max / 14);
  const out: number[] = [];
  for (let i = 0; i <= samples; i++) {
    const x = (i / samples) * max;
    let s = 0;
    values.forEach((v, j) => {
      const z = (x - v) / bw;
      s += (weights?.[j] ?? 1) * Math.exp(-0.5 * z * z);
    });
    out.push(s);
  }
  return out;
}

/** Krillion's distribution curve: where your score falls among others. */
export function DistributionChart({ values, you, max = 700, caption, best, weights, minValues = 3, subcaption, className = "" }: Props) {
  const total = weights ? weights.reduce((a, b) => a + b, 0) : values.length;
  const sub = subcaption && <p className="mt-1 font-hud text-[13px] tracking-[0.2em] text-muted uppercase sm:text-[14px]">{subcaption}</p>;
  if (total < minValues) {
    return (
      <figure className={`w-full ${className}`}>
        <figcaption className="font-hud text-[14px] tracking-[0.25em] text-signal uppercase sm:text-[16px]">{caption}</figcaption>
        {sub}
      </figure>
    );
  }
  const ys = kde(values, max, 100, weights);
  const peak = Math.max(1e-6, ...ys);
  const plotH = H - PAD_B - 8;
  const pts = ys.map((y, i) => [(i / (ys.length - 1)) * W, H - PAD_B - (y / peak) * plotH] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H - PAD_B} L0,${H - PAD_B} Z`;
  const yx = (Math.min(max, Math.max(0, you)) / max) * W;
  const yi = Math.round((Math.min(max, Math.max(0, you)) / max) * (ys.length - 1));
  const yy = values.length ? pts[yi][1] : H - PAD_B;
  const bx = best == null ? null : (Math.min(max, Math.max(0, best)) / max) * W;
  const ticks = Array.from({ length: Math.floor(max / 100) + 1 }, (_, i) => i * 100);
  return (
    <figure className={`w-full ${className}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Score distribution. You scored ${you}. ${caption}`}>
        <path d={area} fill="color-mix(in srgb, var(--signal) 12%, transparent)" />
        <path d={line} fill="none" stroke="var(--signal)" strokeWidth="2" style={{ strokeDasharray: 2000, strokeDashoffset: 2000, animation: "dist-draw 1.4s var(--ease-out) forwards" }} />
        <line x1="0" x2={W} y1={H - PAD_B} y2={H - PAD_B} stroke="color-mix(in srgb, var(--muted) 40%, transparent)" />
        {ticks.map((t) => (
          <g key={t} transform={`translate(${(t / max) * W},${H - PAD_B})`}>
            <line y2="4" stroke="color-mix(in srgb, var(--muted) 50%, transparent)" />
            <text y="16" textAnchor="middle" className="font-hud" fontSize="12" fill="var(--faint)">
              {t}
            </text>
          </g>
        ))}
        {bx !== null && bx !== yx && (
          <g>
            <line x1={bx} x2={bx} y1={8} y2={H - PAD_B} stroke="var(--reward)" strokeWidth="1.5" strokeDasharray="3 3" />
            <text x={bx} y={6} textAnchor="middle" className="font-hud" fontSize="12" fill="var(--reward)" letterSpacing="2">
              PB {best}
            </text>
          </g>
        )}
        <line x1={yx} x2={yx} y1={yy} y2={H - PAD_B} stroke="var(--accent)" strokeWidth="2" />
        <rect x={yx - 4} y={yy - 4} width="8" height="8" fill="var(--accent)" style={{ filter: "drop-shadow(0 0 6px var(--accent))" }} />
        <text x={yx} y={H - 2} textAnchor="middle" className="font-hud" fontSize="13" fill="var(--accent)" letterSpacing="2">
          YOU
        </text>
      </svg>
      <figcaption className="mt-2 font-hud text-[14px] tracking-[0.25em] text-signal uppercase sm:text-[16px]">{caption}</figcaption>
      {sub}
      <style>{`@keyframes dist-draw { to { stroke-dashoffset: 0 } }`}</style>
    </figure>
  );
}
