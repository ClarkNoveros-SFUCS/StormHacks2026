// Pixel particles on a canvas (no dependencies). Client-only.
// Two presets: "bubbles" rise with buoyancy and a sine wobble; "confetti" bursts out and falls.
// Under reduced motion nothing is emitted.
import { prefersReducedMotion } from "./reduced";

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number; //  seconds left
  max: number; //   total life
  kind: "bubble" | "confetti" | "spark";
  phase: number;
  spin: number;
};

export type EmitOptions = {
  count?: number;
  colors?: string[];
  kind?: Particle["kind"];
  spread?: number; // initial speed, px/s
  size?: [number, number];
};

const DEFAULT_COLORS = ["#ffd84d", "#ff5d8f", "#4de3ff", "#9d7bff", "#3ddc97", "#ffffff"];

/** Make particles at (x, y). Pure, exported for tests. */
export function makeParticles(x: number, y: number, opts: EmitOptions = {}, rand = Math.random): Particle[] {
  const { count = 24, colors = DEFAULT_COLORS, kind = "confetti", spread = 380, size = [3, 7] } = opts;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const a = kind === "bubble" ? -Math.PI / 2 + (rand() - 0.5) * 0.9 : rand() * Math.PI * 2;
    const s = kind === "bubble" ? 20 + rand() * 40 : spread * (0.35 + rand() * 0.65);
    const life = kind === "bubble" ? 1.2 + rand() * 0.8 : kind === "spark" ? 0.4 + rand() * 0.4 : 1 + rand() * 0.8;
    out.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - (kind === "confetti" ? spread * 0.35 : 0),
      size: Math.round(size[0] + rand() * (size[1] - size[0])),
      color: colors[Math.floor(rand() * colors.length)],
      life,
      max: life,
      kind,
      phase: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 12,
    });
  }
  return out;
}

/** Advance particles by dt seconds; returns the ones still alive. Pure, exported for tests. */
export function stepParticles(ps: Particle[], dt: number): Particle[] {
  const alive: Particle[] = [];
  for (const p of ps) {
    p.life -= dt;
    if (p.life <= 0) continue;
    if (p.kind === "bubble") {
      p.vy -= 20 * dt; // buoyancy
      p.vx *= Math.pow(0.9, dt);
      p.phase += dt * 5;
      p.x += (p.vx + Math.sin(p.phase) * 18) * dt;
      p.y += p.vy * dt;
    } else {
      p.vy += 900 * dt; // gravity
      p.vx *= Math.pow(0.35, dt);
      p.vy *= Math.pow(0.6, dt);
      p.phase += p.spin * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    alive.push(p);
  }
  return alive;
}

export function drawParticles(ctx: CanvasRenderingContext2D, ps: Particle[]) {
  for (const p of ps) {
    const a = Math.min(1, p.life / (p.max * 0.4));
    ctx.globalAlpha = a;
    if (p.kind === "bubble") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    } else {
      ctx.fillStyle = p.color;
      // confetti "flips" by squashing its width
      const w = Math.max(1, Math.round(p.size * Math.abs(Math.cos(p.phase))));
      ctx.fillRect(Math.round(p.x - w / 2), Math.round(p.y), w, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * A full-screen overlay canvas shared by every burst on the page. Created lazily, removed when idle.
 * `burst(x, y, opts)` takes viewport coordinates.
 */
let overlay: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; ps: Particle[]; raf: number; last: number } | null =
  null;

export function burst(x: number, y: number, opts: EmitOptions = {}) {
  if (typeof window === "undefined" || prefersReducedMotion()) return;
  if (!overlay) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      pointerEvents: "none",
      zIndex: "100",
      imageRendering: "pixelated",
    });
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    overlay = { canvas, ctx, ps: [], raf: 0, last: performance.now() };
    const loop = (now: number) => {
      if (!overlay) return;
      const dt = Math.min(0.05, (now - overlay.last) / 1000);
      overlay.last = now;
      overlay.ps = stepParticles(overlay.ps, dt);
      overlay.ctx.clearRect(0, 0, overlay.canvas.width, overlay.canvas.height);
      drawParticles(overlay.ctx, overlay.ps);
      if (overlay.ps.length === 0) {
        overlay.canvas.remove();
        overlay = null;
        return;
      }
      overlay.raf = requestAnimationFrame(loop);
    };
    overlay.raf = requestAnimationFrame(loop);
  }
  overlay.ps.push(...makeParticles(x, y, opts));
}

/** Burst from the centre of an element. */
export function burstFrom(el: Element | null, opts: EmitOptions = {}) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, opts);
}

/** A big celebratory confetti rain from the top of the screen. */
export function confettiRain(count = 140) {
  if (typeof window === "undefined") return;
  const w = window.innerWidth;
  for (let i = 0; i < 6; i++) {
    burst((w * (i + 0.5)) / 6, -10, { count: Math.round(count / 6), spread: 260 });
  }
}
