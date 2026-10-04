"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { PixelIcon, type PixelIconName } from "@/components/ui";
import { burstFrom } from "@/lib/motion/particles";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import s from "./landing.module.css";

type Props = {
  /** Zone tag shown above the section, e.g. "Twilight zone". */
  zone?: string;
  icon?: PixelIconName;
  id?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A landing section that "surfaces like a catch": below the fold it waits under the water
 * line and springs up with a puff of bubbles when it scrolls into view. Children marked
 * `data-catch` (with `--i` for order) follow one by one. Sections already on screen at load,
 * and everything under reduced motion or without JS, are simply visible.
 */
export function Surface({ zone, icon = "fish", id, labelledBy, className = "", children }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
    el.dataset.surface = "waiting";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          el.dataset.surface = "up";
          io.disconnect();
          const r = el.getBoundingClientRect();
          burstFrom(el, { kind: "bubble", count: 12, spread: Math.min(320, r.width / 2) });
        }
      },
      { rootMargin: "0px 0px -18% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section ref={ref} id={id} aria-labelledby={labelledBy} className={`${s.surface} relative mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}>
      {zone && (
        <div className="mb-6 flex justify-center pt-8">
          <span
            className={`${s.tag} inline-flex items-center gap-2 rounded-sm border border-border-strong bg-bg-2/85 px-3 py-1 font-display text-[12px] tracking-[0.2em] text-muted uppercase backdrop-blur`}
          >
            <PixelIcon name={icon} size={14} /> {zone}
          </span>
        </div>
      )}
      {children}
    </section>
  );
}

/** A section heading with an optional kicker line. */
export function SectionTitle({ id, kicker, title, children }: { id: string; kicker?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mx-auto mb-10 max-w-2xl text-center" data-catch style={{ "--i": 0 } as React.CSSProperties}>
      {kicker && <p className="font-display text-sm tracking-[0.2em] text-signal uppercase">{kicker}</p>}
      <h2 id={id} className="mt-2 text-[clamp(28px,5vw,44px)] text-text [text-shadow:0_2px_0_rgba(0,0,0,.5)]">
        {title}
      </h2>
      {children && <p className="mt-3 text-[17px] text-muted">{children}</p>}
    </header>
  );
}
