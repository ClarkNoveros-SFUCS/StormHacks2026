export type SquareResult = "done" | "miss" | "gold" | undefined;

type Props = {
  total: number;
  /** 1-based current Prompt. */
  current: number;
  results: SquareResult[];
  caption?: string | null;
  className?: string;
};

/** Progress squares (done = reward, gold = top band, miss = dim, current = pulsing accent) + "PROMPT n OF N". */
export function ProgressSquares({ total, current, results, caption, className = "" }: Props) {
  return (
    <div className={`flex flex-col items-center gap-1.5 ${className}`}>
      <ol className="flex gap-1 sm:gap-1.5" aria-label={`Prompt ${current} of ${total}`}>
        {Array.from({ length: total }, (_, i) => {
          const r = results[i];
          const isCurrent = !r && i + 1 === current;
          let bg = "#0d1830";
          let ring = "#2a4670";
          let glow = "";
          if (r === "done") {
            bg = "var(--reward)";
            ring = "#b8941f";
          } else if (r === "gold") {
            bg = "var(--reward)";
            ring = "#fff3c4";
            glow = "0 0 10px var(--reward)";
          } else if (r === "miss") {
            bg = "var(--band-miss)";
            ring = "#2a3a55";
          } else if (isCurrent) {
            bg = "var(--accent)";
            ring = "#ffc2d4";
          }
          return (
            <li
              key={i}
              className="block h-3 w-3 sm:h-4 sm:w-4"
              aria-label={r ? `Prompt ${i + 1}: ${r}` : isCurrent ? `Prompt ${i + 1}: current` : `Prompt ${i + 1}`}
              style={{
                background: bg,
                boxShadow: `inset 0 0 0 2px ${ring}${glow ? `, ${glow}` : ""}`,
                animation: isCurrent ? "dot-pulse 1.4s ease-in-out infinite" : undefined,
                ["--signal" as string]: "var(--accent)",
              }}
            />
          );
        })}
      </ol>
      {caption !== null && (
        <span className="font-hud text-[11px] tracking-[0.3em] text-muted uppercase sm:text-[13px]">
          {caption ?? `Prompt ${Math.min(current, total)} of ${total}`}
        </span>
      )}
    </div>
  );
}
