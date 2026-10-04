import { memo, type CSSProperties } from "react";

export type SpriteRows = readonly string[];
export type SpritePalette = Readonly<Record<string, string>>;

type Props = {
  rows: SpriteRows;
  palette: SpritePalette;
  /** Rendered width in px (height follows the grid's aspect). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

export type SpriteRect = { x: number; y: number; w: number; c: string };

/** Merge each row's horizontal runs into rects. "." / " " / unknown keys are transparent. */
export function spriteRects(rows: SpriteRows, palette: SpritePalette): SpriteRect[] {
  const rects: SpriteRect[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || ch === " " || !palette[ch]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      rects.push({ x, y, w: run, c: palette[ch] });
      x += run;
    }
  });
  return rects;
}

/**
 * Pixel art from a character grid: each character is a palette key, "." is transparent.
 * Rendered as one SVG with crispEdges, merging horizontal runs into single rects.
 */
export const PixelSprite = memo(function PixelSprite({ rows, palette, size = 32, className, style, title }: Props) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const rects = spriteRects(rows, palette);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={size}
      height={(size * h) / w}
      shapeRendering="crispEdges"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.c} />
      ))}
    </svg>
  );
});
