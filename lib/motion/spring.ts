// A tiny damped spring (no dependencies). Client-only: uses requestAnimationFrame.
// Spec: docs/design/design-system.md § Motion. Under reduced motion it jumps to `to`.
import { prefersReducedMotion } from "./reduced";

export type SpringOptions = {
  from: number;
  to: number;
  stiffness?: number; // default 170
  damping?: number; //   default 18
  mass?: number; //      default 1
  velocity?: number; //  initial velocity, units per second
  precision?: number; // rest threshold, default 0.01
  onUpdate: (value: number) => void;
  onRest?: () => void;
};

/** One step of a damped spring, exported for tests. Returns [position, velocity]. */
export function springStep(
  x: number,
  v: number,
  to: number,
  dt: number,
  stiffness: number,
  damping: number,
  mass: number,
): [number, number] {
  const force = -stiffness * (x - to) - damping * v;
  const nv = v + (force / mass) * dt;
  return [x + nv * dt, nv];
}

/** Animate a number with a spring. Returns a cancel function. */
export function spring(opts: SpringOptions): () => void {
  const { from, to, stiffness = 170, damping = 18, mass = 1, precision = 0.01, onUpdate, onRest } = opts;
  if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
    onUpdate(to);
    onRest?.();
    return () => {};
  }
  let x = from;
  let v = opts.velocity ?? 0;
  let last = performance.now();
  let raf = 0;
  let cancelled = false;
  const tick = (now: number) => {
    if (cancelled) return;
    // integrate in small fixed steps for stability
    let dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    while (dt > 0) {
      const step = Math.min(dt, 1 / 120);
      [x, v] = springStep(x, v, to, step, stiffness, damping, mass);
      dt -= step;
    }
    if (Math.abs(v) < precision * 10 && Math.abs(x - to) < precision) {
      onUpdate(to);
      onRest?.();
      return;
    }
    onUpdate(x);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

/** Ease a number over time with a curve (for counters that shouldn't overshoot). */
export function tween(opts: {
  from: number;
  to: number;
  duration: number; // ms
  ease?: (t: number) => number;
  onUpdate: (value: number) => void;
  onRest?: () => void;
}): () => void {
  const { from, to, duration, ease = easeOutCubic, onUpdate, onRest } = opts;
  if (prefersReducedMotion() || typeof requestAnimationFrame === "undefined" || duration <= 0) {
    onUpdate(to);
    onRest?.();
    return () => {};
  }
  const start = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    onUpdate(from + (to - from) * ease(t));
    if (t < 1) raf = requestAnimationFrame(tick);
    else onRest?.();
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
