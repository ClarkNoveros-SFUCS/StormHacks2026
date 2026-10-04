"use client";
import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";

export type SkyVariant = "auto" | "day" | "dusk" | "night" | "ocean";

type Props = {
  variant?: SkyVariant;
  /** Layers shift with the cursor. */
  parallax?: boolean;
  /** The sea at the bottom rises with page scroll until the view is underwater (landing). */
  scrollDive?: boolean;
  /** Show the sea strip at the bottom (default true). */
  sea?: boolean;
  /** 0–1 overall strength, so content stays readable. */
  intensity?: number;
  className?: string;
};

type Sky = { stops: string[]; stars: number; cloud: string; cloudShade: string; sea: string; seaDeep: string; glow: string };

const SKIES: Record<Exclude<SkyVariant, "auto" | "ocean">, Sky> = {
  night: { stops: ["#05070f", "#0a0d1c", "#11163a", "#1b2150"], stars: 1, cloud: "#1d2350", cloudShade: "#151a40", sea: "#0d1a3a", seaDeep: "#060b1c", glow: "#2a3a8a" },
  dusk: { stops: ["#0a0d1c", "#1c1840", "#4a2a5e", "#a04a6a"], stars: 0.5, cloud: "#5a3a6e", cloudShade: "#3e2852", sea: "#1a2048", seaDeep: "#0a0d24", glow: "#ff8a6a" },
  day: { stops: ["#0b1a3a", "#13305e", "#1f4f86", "#3a78ad"], stars: 0, cloud: "#4a7fb0", cloudShade: "#36659a", sea: "#163f6e", seaDeep: "#0a1f3c", glow: "#9fd8ff" },
};

function timeOfDay(): keyof typeof SKIES {
  const h = new Date().getHours();
  if (h >= 7 && h < 17) return "day";
  if ((h >= 17 && h < 20) || (h >= 5 && h < 7)) return "dusk";
  return "night";
}

type Cloud = { x: number; y: number; w: number; speed: number; layer: number };
type Star = { x: number; y: number; tw: number; big: boolean };
type Bubble = { x: number; y: number; r: number; speed: number; ph: number };
type Bird = { x: number; y: number; speed: number; ph: number };

const SCALE = 3; // canvas pixels are 3×3 screen pixels

/**
 * The living pixel backdrop behind site pages: a posterized sky by local time of day, twinkling
 * stars, drifting cloud layers, birds, and a sea strip with waves and bubbles. Cursor parallax.
 * Fixed, behind content, aria-hidden. Static under reduced motion; paused in hidden tabs.
 */
export function SkyBackdrop({ variant = "auto", parallax = true, scrollDive = false, sea = true, intensity = 1, className = "" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    const skyKey = variant === "auto" ? timeOfDay() : variant === "ocean" ? "night" : variant;
    const sky = SKIES[skyKey];
    let W = 0;
    let H = 0;
    let clouds: Cloud[] = [];
    let stars: Star[] = [];
    let bubbles: Bubble[] = [];
    let birds: Bird[] = [];
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let scroll = 0;

    const resize = () => {
      W = Math.ceil(window.innerWidth / SCALE);
      H = Math.ceil(window.innerHeight / SCALE);
      canvas.width = W;
      canvas.height = H;
      const rnd = mulberry(7);
      stars = Array.from({ length: Math.round((W * H) / 700) }, () => ({ x: rnd() * W, y: rnd() * H * 0.7, tw: rnd() * 6, big: rnd() < 0.05 }));
      clouds = Array.from({ length: 9 }, (_, i) => ({
        x: rnd() * W,
        y: H * (0.1 + rnd() * 0.5),
        w: 18 + rnd() * 40,
        speed: 1.5 + (i % 3) * 1.5,
        layer: i % 3,
      }));
      bubbles = Array.from({ length: 26 }, () => ({ x: rnd() * W, y: H * (0.85 + rnd() * 0.3), r: rnd() < 0.3 ? 2 : 1, speed: 4 + rnd() * 8, ph: rnd() * 6 }));
      birds = skyKey === "night" ? [] : Array.from({ length: 3 }, (_, i) => ({ x: -20 - i * 14, y: H * (0.18 + i * 0.03), speed: 8 + i, ph: i }));
    };

    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      scroll = Math.min(1, window.scrollY / max);
    };

    const draw = (t: number) => {
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;
      const px = parallax ? mouse.x : 0;
      const py = parallax ? mouse.y : 0;
      // sea line: bottom 16% normally; rises to the top when scroll-diving
      const dive = scrollDive ? scroll : variant === "ocean" ? 0.85 : 0;
      const seaTop = Math.round(H * (0.84 - dive * 0.9));

      // sky: posterized bands
      const bands = 24;
      for (let i = 0; i < bands; i++) {
        const f = i / (bands - 1);
        ctx.fillStyle = mixStops(sky.stops, f);
        ctx.fillRect(0, Math.floor((i * seaTop) / bands), W, Math.ceil(seaTop / bands) + 1);
      }
      // horizon glow
      const g = ctx.createRadialGradient(W / 2 - px * 6, seaTop, 4, W / 2 - px * 6, seaTop, W * 0.6);
      g.addColorStop(0, hexA(sky.glow, 0.28));
      g.addColorStop(1, hexA(sky.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, seaTop);

      // stars
      if (sky.stars > 0) {
        for (const s of stars) {
          if (s.y > seaTop - 4) continue;
          const a = sky.stars * (0.2 + 0.5 * Math.abs(Math.sin(t / 900 + s.tw)));
          ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
          const sx = Math.round(s.x - px * 2);
          const sy = Math.round(s.y - py * 2);
          ctx.fillRect(sx, sy, 1, 1);
          if (s.big && a > 0.5) {
            ctx.fillRect(sx - 1, sy, 3, 1);
            ctx.fillRect(sx, sy - 1, 1, 3);
          }
        }
      }

      // clouds, back to front
      for (const c of clouds) {
        c.x += (c.speed * (reduced ? 0 : 1)) / 60;
        if (c.x > W + c.w) c.x = -c.w * 1.5;
        const depth = (c.layer + 1) * 3;
        const cx = Math.round(c.x - px * depth);
        const cy = Math.round(c.y - py * depth * 0.6);
        if (cy > seaTop - 6) continue;
        drawCloud(ctx, cx, cy, Math.round(c.w), c.layer === 2 ? sky.cloud : sky.cloudShade);
      }

      // birds
      for (const b of birds) {
        b.x += b.speed / 60;
        if (b.x > W + 30) b.x = -30 - Math.random() * 120;
        const flap = Math.sin(t / 120 + b.ph) > 0;
        const bx = Math.round(b.x - px * 4);
        const by = Math.round(b.y + Math.sin(t / 700 + b.ph) * 2);
        ctx.fillStyle = "rgba(10,13,28,.8)";
        ctx.fillRect(bx, by, 1, 1);
        ctx.fillRect(bx - 1, by + (flap ? -1 : 1), 1, 1);
        ctx.fillRect(bx + 1, by + (flap ? -1 : 1), 1, 1);
        ctx.fillRect(bx - 2, by + (flap ? -2 : 1), 1, 1);
        ctx.fillRect(bx + 2, by + (flap ? -2 : 1), 1, 1);
      }

      if (sea || scrollDive || variant === "ocean") {
        // water body
        const depthBands = 10;
        for (let i = 0; i < depthBands; i++) {
          const f = i / (depthBands - 1);
          ctx.fillStyle = mixStops([sky.sea, sky.seaDeep], f);
          const y0 = seaTop + Math.floor(((H - seaTop) * i) / depthBands);
          ctx.fillRect(0, y0, W, Math.ceil((H - seaTop) / depthBands) + 1);
        }
        // light rays under the surface
        ctx.fillStyle = hexA(sky.glow, 0.05);
        for (let i = 0; i < 5; i++) {
          const rx = ((i * W) / 5 + t / 80 - px * 5) % (W + 40);
          ctx.beginPath();
          ctx.moveTo(rx, seaTop);
          ctx.lineTo(rx + 10, seaTop);
          ctx.lineTo(rx - 20, H);
          ctx.lineTo(rx - 34, H);
          ctx.fill();
        }
        // waves
        ctx.fillStyle = hexA(sky.glow, 0.45);
        for (let x = 0; x < W; x += 2) {
          const wy = seaTop + Math.round(Math.sin(x / 9 + t / 600) * 1.2);
          ctx.fillRect(x, wy, 2, 1);
        }
        // bubbles
        for (const b of bubbles) {
          b.y -= (b.speed * (reduced ? 0 : 1)) / 60;
          b.ph += 0.03;
          if (b.y < seaTop + 2) b.y = H + Math.random() * 20;
          const bx = Math.round(b.x + Math.sin(b.ph) * 2 - px * 3);
          ctx.strokeStyle = "rgba(127,214,255,.45)";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, Math.round(b.y) + 0.5, b.r, b.r);
        }
      }
    };

    resize();
    onScroll();
    window.addEventListener("resize", resize);
    if (parallax) window.addEventListener("pointermove", onMove);
    if (scrollDive) window.addEventListener("scroll", onScroll, { passive: true });

    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reduced) draw(0);
      else raf = requestAnimationFrame(loop);
    };
    const onVis = () => (document.hidden ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVis);
    start();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [variant, parallax, scrollDive, sea]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none fixed inset-0 -z-10 h-full w-full ${className}`}
      style={{ imageRendering: "pixelated", opacity: intensity }}
    />
  );
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  ctx.fillStyle = color;
  const h = Math.max(4, Math.round(w / 5));
  ctx.fillRect(x, y + h / 2, w, h / 2);
  ctx.fillRect(x + w * 0.15, y + h / 4, w * 0.5, h / 2);
  ctx.fillRect(x + w * 0.35, y, w * 0.35, h / 2);
  ctx.fillRect(x + w * 0.6, y + h / 4, w * 0.25, h / 2);
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hexA(c: string, a: number) {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}
function mixStops(stops: string[], f: number) {
  const p = Math.min(0.9999, Math.max(0, f)) * (stops.length - 1);
  const i = Math.floor(p);
  const t = p - i;
  const a = hex(stops[i]);
  const b = hex(stops[Math.min(stops.length - 1, i + 1)]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
