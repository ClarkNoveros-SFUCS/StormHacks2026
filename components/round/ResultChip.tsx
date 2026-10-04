type Band = 0 | 1 | 2 | 3 | 4;

type Props = {
  text: string;
  band: Band;
  points: number;
  /** Points halved by Staleness. */
  stale?: boolean;
  /** Tier dropped by a Hint. */
  hinted?: boolean;
  className?: string;
};

const BAND_COLOR = ["var(--band-miss)", "var(--band-1)", "var(--band-2)", "var(--band-3)", "var(--band-4)"];

/** The Answer in a chip ringed and glowing in its band colour. Band 4 pulses gold. */
export function ResultChip({ text, band, points, stale, hinted, className = "" }: Props) {
  const c = BAND_COLOR[band];
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 font-hud text-[20px] leading-none whitespace-nowrap text-text sm:text-[24px] ${className}`}
      style={{
        background: `color-mix(in srgb, ${c} 16%, rgba(6,13,26,.94))`,
        boxShadow: `inset 0 0 0 2px ${c}, 0 0 16px color-mix(in srgb, ${c} 45%, transparent)`,
        animation: band === 4 ? "gold-pulse 1s ease-in-out infinite" : undefined,
      }}
    >
      <span className="max-w-[46vw] truncate uppercase">{text}</span>
      <span style={{ color: c }}>+{points}</span>
      {hinted && <span className="text-[14px] text-caution">HINT</span>}
      {stale && <span className="text-[14px] text-muted">REPEAT ÷2</span>}
    </span>
  );
}
