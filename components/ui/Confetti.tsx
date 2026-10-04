"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { burstFrom, confettiRain, type EmitOptions } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";

export { burst, burstFrom, confettiRain } from "@/lib/motion/particles";

/** Fire a celebration: confetti from the top plus the level-up chime. */
export function celebrate() {
  confettiRain();
  sfx.levelUp();
}

type Props = {
  /** Increment to fire a burst from this element's centre (0 never fires). */
  fire: number;
  options?: EmitOptions;
  children?: ReactNode;
  className?: string;
};

/** Wraps something (a badge, a button) and bursts pixel confetti from it whenever `fire` increments. */
export function PixelBurst({ fire, options, children, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(fire);
  useEffect(() => {
    if (fire > 0 && fire !== last.current) burstFrom(ref.current, options);
    last.current = fire;
  }, [fire, options]);
  return (
    <span ref={ref} className={`inline-flex ${className}`}>
      {children}
    </span>
  );
}
