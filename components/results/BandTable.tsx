import { PixelIcon, type PixelIconName } from "@/components/ui/PixelIcon";

export type BandRow = { range: string; label: string; verdict: string; icon: PixelIconName; color: string };

type Props = {
  bands: BandRow[];
  /** The Player's row, lit. */
  activeIndex: number;
  title?: string;
  className?: string;
};

/** THE BEARING: score ranges with one-line verdicts; the Player's row is lit. */
export function BandTable({ bands, activeIndex, title = "THE BEARING", className = "" }: Props) {
  return (
    <section className={`w-full ${className}`}>
      <h3 className="label-line !font-hud !text-[14px] sm:!text-[16px]">{title}</h3>
      <ul className="mt-3">
        {bands.map((b, i) => {
          const on = i === activeIndex;
          return (
            <li
              key={b.range}
              className="flex items-center gap-4 border-b border-white/10 py-3 font-hud text-[17px] sm:text-[19px]"
              style={{ opacity: on ? 1 : 0.55 }}
              aria-current={on ? "true" : undefined}
            >
              <PixelIcon name={b.icon} size={16} palette={{ c: b.color, b: b.color, v: b.color, y: b.color }} />
              <span className="w-[76px] shrink-0 tabular-nums" style={{ color: b.color }}>
                {b.range}
              </span>
              <span className={on ? "text-text" : "text-muted"}>
                {b.label}. {b.verdict}
              </span>
              {on && <span className="ml-auto text-accent">◀</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
