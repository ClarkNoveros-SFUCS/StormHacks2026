"use client";
// The Dive world: a tall pixel ocean (sky → sunlit → twilight → midnight → abyss → trench)
// drawn on a low-res canvas, with a sprung camera (DiveCamera, 10 m per point).
// Spec: docs/design/modes/dive.md § Real descent. Mapping: ./depth.ts.
import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { anchorY, DiveCamera, depthAtScreenY, pxPerMetre, screenYOf } from "./depth";
import {
  ANGLER_SIL,
  BOAT,
  BOAT_ALT,
  drawSprite,
  EEL,
  FISH,
  JELLY_A,
  JELLY_B,
  makeCreatures,
  MASCOT,
  MASCOT_PAL,
  rgb,
  SKY,
  SMALL_FISH,
  SQUID,
  waterRgb,
  type Creature,
} from "./ocean-art";

export type OceanSky = "day" | "dusk";

export type OceanStageHandle = {
  /** Move the camera to `m` metres (sprung), or jump with `{ instant: true }`. */
  setDepth(m: number, opts?: { instant?: boolean }): void;
  /** The mascot reacts: a happy hop with bubbles, or a sad droop. */
  mascot(kind: "happy" | "sad"): void;
  /** Release bubbles at a viewport fraction (default: centre). `gold` for a Trench catch. */
  bubbles(opts?: { xFrac?: number; yFrac?: number; count?: number; gold?: boolean }): void;
};

type Props = {
  /** Camera target in metres. Changing it springs the camera. */
  depth?: number;
  /** Share a camera with a DepthRuler / HUD. One is created if omitted. */
  camera?: DiveCamera;
  sky?: OceanSky;
  showMascot?: boolean;
  className?: string;
  children?: ReactNode;
  ref?: Ref<OceanStageHandle>;
};

type Speck = { x: number; y: number; z: number; ph: number };
type Bubble = { x: number; y: number; vy: number; size: number; life: number; gold: boolean; ph: number };

/** Low-res pixel size in CSS px. */
function pixelSize(w: number) {
  return w < 640 ? 2 : 3;
}

export function OceanStage({ depth, camera: cameraProp, sky = "day", showMascot = true, className = "", children, ref }: Props) {
  const [ownCamera] = useState(() => new DiveCamera());
  const camera = cameraProp ?? ownCamera;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const skyRef = useRef<OceanSky>(sky);
  const fx = useRef({
    bubbles: [] as Bubble[],
    mascotHop: 0,
    mascotSad: 0,
    pending: [] as { xFrac: number; yFrac: number; count: number; gold: boolean }[],
  });

  useEffect(() => {
    skyRef.current = sky;
  }, [sky]);

  useEffect(() => {
    if (depth !== undefined) camera.set(depth);
  }, [depth, camera]);

  useImperativeHandle(
    ref,
    () => ({
      setDepth: (m, opts) => camera.set(m, opts?.instant),
      mascot: (kind) => {
        if (kind === "happy") fx.current.mascotHop = 1;
        else fx.current.mascotSad = 1.4;
      },
      bubbles: (opts = {}) => {
        fx.current.pending.push({
          xFrac: opts.xFrac ?? 0.5,
          yFrac: opts.yFrac ?? 0.5,
          count: opts.count ?? 10,
          gold: opts.gold ?? false,
        });
      },
    }),
    [camera],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const creatures: Creature[] = makeCreatures();
    let W = 0; // CSS px
    let H = 0;
    let P = 3; // CSS px per canvas px
    let w = 0; // canvas px
    let h = 0;
    let specks: Speck[] = [];
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let prevCam = camera.depth;
    let mascotX = 0.12;
    let mascotTarget = 0.12;
    let nextBubbleAt = 2;
    let nextWanderAt = 3;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      P = pixelSize(W);
      w = Math.ceil(W / P);
      h = Math.ceil(H / P);
      canvas.width = w;
      canvas.height = h;
      const n = Math.round((w * h) / 260);
      specks = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.8, ph: Math.random() * 6.28 }));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now: number) => {
      // rAF itself stops in hidden tabs, so the scene pauses for free.
      raf = requestAnimationFrame(frame);
      const reduced = prefersReducedMotion();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!reduced) t += dt;
      camera.step(dt, reduced);
      const cam = camera.depth;
      const camDeltaPx = (cam - prevCam) * pxPerMetre(H);
      prevCam = cam;
      const speed = Math.abs(camera.velocity);
      const S = SKY[skyRef.current];
      const ppm = pxPerMetre(H);
      const toLow = (cssY: number) => cssY / P;

      // ── water column ──
      const wlCss = screenYOf(0, cam, H);
      const wl = toLow(wlCss);
      const waterTop = Math.max(0, Math.floor(wl) - 3);
      if (waterTop < h) {
        const g = ctx.createLinearGradient(0, waterTop, 0, h);
        for (let k = 0; k <= 6; k++) {
          const y = waterTop + ((h - waterTop) * k) / 6;
          g.addColorStop(k / 6, rgb(waterRgb(Math.max(0, depthAtScreenY(y * P, cam, H)))));
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, waterTop, w, h - waterTop);
      }

      // ── sky + waterline ──
      if (wl > -4) {
        const skyH = toLow(H * 0.25) + 8;
        const sg = ctx.createLinearGradient(0, wl - skyH, 0, wl);
        sg.addColorStop(0, S.top);
        sg.addColorStop(1, S.bottom);
        ctx.fillStyle = sg;
        for (let x = 0; x < w; x++) {
          const wave = reduced ? 0 : Math.sin(x * 0.09 + t * 1.3) * 0.9 + Math.sin(x * 0.033 - t * 0.6) * 0.9;
          const top = Math.round(wl + wave);
          if (top > 0) ctx.fillRect(x, 0, 1, top);
          ctx.fillStyle = skyRef.current === "day" ? "rgba(255,255,255,0.45)" : "rgba(255,170,190,0.25)";
          ctx.fillRect(x, top, 1, 1);
          ctx.fillStyle = sg;
        }
        // clouds
        ctx.fillStyle = S.cloud;
        for (let i = 0; i < 5; i++) {
          const cw = 18 + ((i * 7) % 13);
          const cx = ((i * 0.23 + t * 0.004 * (1 + i * 0.3)) % 1.2) * (w + cw * 2) - cw;
          const cy = wl - skyH * (0.35 + ((i * 37) % 50) / 100);
          if (cy + 6 < 0) continue;
          ctx.fillRect(Math.round(cx), Math.round(cy), cw, 3);
          ctx.fillRect(Math.round(cx + 4), Math.round(cy - 2), cw - 9, 2);
          ctx.fillRect(Math.round(cx + 8), Math.round(cy - 4), Math.max(4, cw - 16), 2);
        }
        // boat
        // Krillion's boat is big: about a seventh of the screen wide on desktop.
        const boatScale = W < 640 ? 1 : 2;
        const boatX = Math.round(w * (W < 640 ? 0.12 : 0.17));
        const bob = reduced ? 0 : Math.round(Math.sin(t * 1.6) * boatScale);
        const boatY = Math.round(wl) - (BOAT.length - 3) * boatScale + bob;
        const pal = { k: S.boat, p: S.flag, f: S.flag, w: S.window };
        const flagFrame = !reduced && Math.floor(t * 2.5) % 2 === 0;
        drawSprite(ctx, flagFrame ? BOAT_ALT : BOAT, pal, boatX, boatY, { scale: boatScale });
      }

      // ── light rays (fade by 600 m) ──
      const rayStrength = Math.max(0, 1 - cam / 600);
      if (rayStrength > 0.01) {
        const top = Math.max(0, wl);
        const len = h * 0.9;
        for (let i = 0; i < 5; i++) {
          const sway = reduced ? 0 : Math.sin(t * 0.4 + i * 1.7) * 6;
          const x0 = w * (0.12 + i * 0.2) + sway;
          const rg = ctx.createLinearGradient(0, top, 0, top + len);
          rg.addColorStop(0, `rgba(170,215,255,${0.09 * rayStrength})`);
          rg.addColorStop(1, "rgba(170,215,255,0)");
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.moveTo(x0, top);
          ctx.lineTo(x0 + 10 + (i % 2) * 6, top);
          ctx.lineTo(x0 + 40 + i * 4, top + len);
          ctx.lineTo(x0 + 14, top + len);
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── creatures (world-attached, parallax by z) ──
      for (const c of creatures) {
        const sy = toLow(anchorY(cam, H) + (c.m - cam) * ppm * c.z);
        if (sy < wl + 4 || sy < -40 || sy > h + 40) continue;
        if (!reduced) c.x = (((c.x + c.speed * dt * c.z) % 1.3) + 1.3) % 1.3;
        const sx = c.x * (w + 60) - 30;
        const flip = c.speed > 0;
        const base = waterRgb(Math.max(0, c.m));
        const sil = rgb([base[0] * 0.35, base[1] * 0.4, base[2] * 0.5], 0.55 + c.z * 0.3);
        if (c.kind === "school") {
          for (let k = 0; k < 5; k++) {
            const ox = (k % 3) * 8 + (k > 2 ? 4 : 0);
            const oy = Math.floor(k / 3) * 5 + Math.round(Math.sin(t * 2 + k + c.phase));
            drawSprite(ctx, SMALL_FISH, { x: sil }, sx + ox, sy + oy, { flip });
          }
        } else if (c.kind === "fish") {
          drawSprite(ctx, FISH, { x: sil }, sx, sy, { flip });
        } else if (c.kind === "jelly") {
          const frame2 = Math.floor(t * 2 + c.phase) % 2 === 0;
          const yy = sy + (reduced ? 0 : Math.sin(t * 0.8 + c.phase) * 3);
          drawSprite(ctx, frame2 ? JELLY_A : JELLY_B, { x: `rgba(170,140,255,${0.18 + 0.2 * c.z})` }, sx, yy);
        } else if (c.kind === "angler") {
          drawSprite(ctx, ANGLER_SIL, { x: sil }, sx, sy, { flip });
          const lx = flip ? sx + 2 : sx + ANGLER_SIL[0].length - 3;
          const pulse = 0.6 + 0.4 * Math.sin(t * 3 + c.phase);
          ctx.fillStyle = `rgba(255,209,102,${0.07 * pulse})`;
          ctx.fillRect(lx - 1, sy - 3, 3, 7);
          ctx.fillRect(lx - 3, sy - 1, 7, 3);
          ctx.fillRect(lx - 2, sy - 2, 5, 5);
          ctx.fillStyle = `rgba(255,209,102,${0.9 * pulse})`;
          ctx.fillRect(lx, sy, 1, 1);
        } else if (c.kind === "eel") {
          drawSprite(ctx, EEL, { x: sil }, sx, sy + Math.round(Math.sin(t + c.phase) * 1), { flip });
        } else {
          drawSprite(ctx, SQUID, { x: rgb([base[0] * 0.25, base[1] * 0.3, base[2] * 0.42], 0.75) }, sx, sy, { scale: 3, flip });
        }
      }

      // ── marine snow: world-attached specks with parallax; streaks while descending ──
      const camLow = camDeltaPx / P;
      ctx.fillStyle = "#cfe6ff";
      for (const s of specks) {
        if (!reduced) {
          s.y -= camLow * s.z;
          s.y += 1.2 * s.z * dt;
          s.ph += dt;
          s.x += Math.sin(s.ph * 0.7) * 0.03;
        }
        if (s.y < 0) {
          s.y += h;
          s.x = Math.random() * w;
        } else if (s.y > h) {
          s.y -= h;
          s.x = Math.random() * w;
        }
        if (s.y < wl + 2) continue;
        // Krillion's water stays calm on the way down: specks smear a little, never into rain.
        const streak = Math.min(2, Math.abs(camLow * s.z) * 0.5);
        ctx.globalAlpha = 0.12 + s.z * 0.3;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1 + Math.round(streak));
      }
      ctx.globalAlpha = 1;

      // ── mascot (screen space, under the play area) ──
      const f = fx.current;
      let mascotPx = 0;
      let mascotPy = 0;
      if (showMascot) {
        if (!reduced && t > nextWanderAt) {
          mascotTarget = 0.05 + Math.random() * 0.12;
          nextWanderAt = t + 4 + Math.random() * 4;
        }
        mascotX += (mascotTarget - mascotX) * Math.min(1, dt * 0.6);
        f.mascotHop = Math.max(0, f.mascotHop - dt * 1.6);
        f.mascotSad = Math.max(0, f.mascotSad - dt);
        const hop = Math.sin(f.mascotHop * Math.PI) * 10;
        const bob = reduced ? 0 : Math.sin(t * 1.8) * 2;
        mascotPx = Math.round(w * mascotX);
        mascotPy = Math.round(Math.max(wl + 10, h * 0.62) + bob - hop + f.mascotSad * 3);
        const lure = { ...MASCOT_PAL, y: f.mascotSad > 0 ? "#7a6a3a" : MASCOT_PAL.y };
        // lure glow
        const glow = ctx.createRadialGradient(mascotPx + 11.5, mascotPy + 3.5, 0, mascotPx + 11.5, mascotPy + 3.5, 14);
        const a = (f.mascotSad > 0 ? 0.08 : 0.28) * (0.8 + 0.2 * Math.sin(t * 3));
        glow.addColorStop(0, `rgba(255,209,102,${a})`);
        glow.addColorStop(1, "rgba(255,209,102,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(mascotPx - 4, mascotPy - 12, 32, 32);
        drawSprite(ctx, MASCOT, lure, mascotPx, mascotPy);
        if (!reduced && t > nextBubbleAt) {
          f.bubbles.push({ x: mascotPx + 13, y: mascotPy + 6, vy: -8, size: 2, life: 3, gold: false, ph: Math.random() * 6 });
          nextBubbleAt = t + 3 + Math.random() * 3;
        }
        if (f.mascotHop > 0.95 && !reduced) {
          for (let k = 0; k < 6; k++) f.bubbles.push({ x: mascotPx + 12, y: mascotPy + 4, vy: -10 - Math.random() * 14, size: 1 + (k % 2), life: 2, gold: false, ph: k });
        }
      }

      // ── bubbles: pending bursts, descent stream, mascot ──
      if (!reduced) {
        for (const p of f.pending) {
          for (let k = 0; k < p.count; k++) {
            f.bubbles.push({
              x: p.xFrac * w + (Math.random() - 0.5) * 16,
              y: p.yFrac * h + (Math.random() - 0.5) * 6,
              vy: -10 - Math.random() * 22,
              size: 1 + Math.floor(Math.random() * 3),
              life: 1.5 + Math.random() * 1.5,
              gold: p.gold && k % 2 === 0,
              ph: Math.random() * 6,
            });
          }
        }
        if (speed > 20 && Math.random() < Math.min(0.9, speed / 400)) {
          f.bubbles.push({ x: w * (0.3 + Math.random() * 0.4), y: h + 2, vy: -20 - speed * 0.05, size: 1 + Math.floor(Math.random() * 2), life: 3, gold: false, ph: Math.random() * 6 });
        }
      }
      f.pending = [];
      const alive: Bubble[] = [];
      for (const b of f.bubbles) {
        b.life -= dt;
        b.y += b.vy * dt - camLow * 0.2;
        b.ph += dt * 4;
        if (b.life <= 0 || b.y < wl) continue;
        alive.push(b);
        const bx = Math.round(b.x + Math.sin(b.ph) * 1.2);
        const by = Math.round(b.y);
        ctx.globalAlpha = Math.min(1, b.life);
        if (b.size >= 3) {
          ctx.strokeStyle = b.gold ? "#ffd166" : "rgba(200,235,255,0.8)";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, 2, 2);
        } else {
          ctx.fillStyle = b.gold ? "#ffd166" : "rgba(200,235,255,0.8)";
          ctx.fillRect(bx, by, b.size, b.size);
        }
      }
      ctx.globalAlpha = 1;
      f.bubbles = alive.slice(-240);

      // ── darkness: the deep closes in, the lure stays lit ──
      const dark = Math.min(0.72, cam / 4000);
      if (dark > 0.01 || wl < h) {
        const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.25, w / 2, h * 0.45, Math.max(w, h) * 0.75);
        vg.addColorStop(0, `rgba(2,4,10,${dark * 0.35})`);
        vg.addColorStop(1, `rgba(2,4,10,${0.25 + dark * 0.6})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, Math.max(0, Math.floor(wl)), w, h);
        if (showMascot && dark > 0.2) {
          ctx.globalCompositeOperation = "lighter";
          const lg = ctx.createRadialGradient(mascotPx + 11.5, mascotPy + 3.5, 0, mascotPx + 11.5, mascotPy + 3.5, 26);
          lg.addColorStop(0, `rgba(255,200,90,${0.18 * dark})`);
          lg.addColorStop(1, "rgba(255,200,90,0)");
          ctx.fillStyle = lg;
          ctx.fillRect(mascotPx - 20, mascotPy - 24, 64, 56);
          ctx.globalCompositeOperation = "source-over";
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [camera, showMascot]);

  return (
    <div className={`absolute inset-0 overflow-hidden bg-[#05080f] ${className}`}>
      <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 h-full w-full [image-rendering:pixelated]" />
      {/* CRT scanlines */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{ background: "repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px)" }}
      />
      {children}
    </div>
  );
}
