"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";

type Props = {
  value: number;
  /** Format the number (default: thousands separators). Non-digit characters render static. */
  format?: (n: number) => string;
  className?: string;
  /** Roll duration in ms. */
  duration?: number;
};

/**
 * Rolling-digit number: each digit is a vertical strip of 0–9 that slides to its value,
 * so changes roll like an odometer. Screen readers get the plain number.
 */
export function Odometer({ value, format = (n) => Math.round(n).toLocaleString(), className = "", duration = 900 }: Props) {
  const reduced = useReducedMotion();
  // Start from zero-filled so the first render rolls up.
  const text = format(value);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const chars = text.split("");
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={text} role="img">
      {chars.map((ch, i) => {
        const d = Number(ch);
        if (ch === " " || Number.isNaN(d)) {
          return (
            <span key={`s${i}`} aria-hidden="true">
              {ch}
            </span>
          );
        }
        const pos = mounted ? d : 0;
        return (
          <span
            key={`${chars.length - i}`}
            aria-hidden="true"
            className="relative inline-block overflow-hidden"
            style={{ height: "1.1em", lineHeight: "1.1em", width: "0.62em" }}
          >
            <span
              className="absolute inset-x-0 top-0 flex flex-col items-center"
              style={{
                transform: `translateY(${-pos * 1.1}em)`,
                transition: reduced ? "none" : `transform ${duration + (chars.length - i) * 60}ms var(--ease-out)`,
              }}
            >
              {"0123456789".split("").map((n) => (
                <span key={n} style={{ height: "1.1em" }}>
                  {n}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
