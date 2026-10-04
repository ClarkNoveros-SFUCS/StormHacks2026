"use client";
import { useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";

type CardProps = {
  interactive?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/** Site card: surface, 1px border, 10px radius. `interactive` lifts and glows on hover. */
export function Card({ interactive, as: As = "div", className = "", style, children }: CardProps) {
  return (
    <As className={`card ${className}`} data-interactive={interactive ? "true" : undefined} style={style}>
      {children}
    </As>
  );
}

type TiltProps = {
  /** Max tilt in degrees. */
  max?: number;
  /** Show the glare sweep that follows the cursor. */
  glare?: boolean;
  className?: string;
  children?: ReactNode;
};

/**
 * A card that tilts in 3D toward the cursor with a moving glare highlight.
 * Writes CSS variables directly (no React state per frame). Flat under reduced motion.
 */
export function TiltCard({ max = 8, glare = true, className = "", children }: TiltProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const raf = useRef(0);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || e.pointerType === "touch") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      el.style.setProperty("--rx", `${(0.5 - py) * max * 2}deg`);
      el.style.setProperty("--ry", `${(px - 0.5) * max * 2}deg`);
      el.style.setProperty("--gx", `${px * 100}%`);
      el.style.setProperty("--gy", `${py * 100}%`);
      el.style.setProperty("--go", "1");
    });
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--go", "0");
  };

  return (
    <div style={{ perspective: "900px" }} className={className}>
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="card relative h-full overflow-hidden hover:border-border-strong"
        style={{
          transform: "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
          transformStyle: "preserve-3d",
          transition: "transform .25s var(--ease-out), border-color .2s, box-shadow .3s",
          boxShadow: "0 20px 40px -24px rgba(0,0,0,.8)",
        }}
      >
        {children}
        {glare && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: "var(--go, 0)",
              transition: "opacity .3s",
              background:
                "radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,.18), transparent 45%)",
              mixBlendMode: "screen",
            }}
          />
        )}
      </div>
    </div>
  );
}
