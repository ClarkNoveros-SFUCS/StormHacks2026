"use client";
// The landing page's living backdrop: one tall pixel world, sky → waterline → sunlit →
// twilight → midnight → abyss → trench seabed. The camera follows page scroll (with a little
// inertia), layers shift with the cursor, and in the deep the cursor becomes a lantern.
// A depth gauge on the right reads the camera's depth. Pure maths in ./world.ts.
import { useEffect, useRef } from "react";
import { BackdropPortal } from "@/components/site/BackdropPortal";
import { ANGLER_SIL, BOAT, BOAT_ALT, drawSprite, EEL, FISH, JELLY_A, JELLY_B, SMALL_FISH, SQUID } from "@/components/modes/dive/ocean-art";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import {
  altitudeAt, CAMERA_SPEED, css, depthFraction, formatGauge, metresAt, rampRgb, seabedY, SKY_STOPS, skyKindFor,
  waterAt, waterlineY, zoneAt, type SkyKind, type WorldFrame,
} from "./world";

type Kind = "school" | "fish" | "jelly" | "whale" | "angler" | "eel" | "squid";
type Creature = { frac: number; x: number; speed: number; kind: Kind; z: number; ph: number; colour: string };
type Speck = { x: number; y: number; z: number; ph: number };
type Glow = { x: number; frac: number; ph: number; c: string };

const WHALE = [
  "..........xxxxxxxxxx..........",
  ".......xxxxxxxxxxxxxxxx.......",
  ".....xxxxxxxxxxxxxxxxxxxx...xx",
  "...xxxxxxxxxxxxxxxxxxxxxxx.xxx",
  "..xxwxxxxxxxxxxxxxxxxxxxxxxxx.",
  ".xxxxxxxxxxxxxxxxxxxxxxxxxxx..",
  "xxxxxxxxxxxxxxxxxxxxxxxxxxx.xx",
  ".llllllllllllxxxxxxxxxxxx...xx",
  "..lllllllllllllxxxxxxxx.......",
  "......llllll....xx............",
];
const CHEST = ["..yyyyyy..", ".ynnnnnny.", "ynnnnnnnny", "yyyyyyyyyy", "ynnnwwnnny", "ynnnnnnnny", "yyyyyyyyyy"];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeCreatures(): Creature[] {
  const r = rand(11);
  const out: Creature[] = [];
  let f = 0.03;
  while (f < 0.97) {
    const v = r();
    let kind: Kind;
    if (f < 0.18) kind = v < 0.55 ? "school" : "fish";
    else if (f < 0.4) kind = v < 0.35 ? "fish" : v < 0.75 ? "jelly" : v < 0.85 ? "whale" : "school";
    else if (f < 0.7) kind = v < 0.4 ? "jelly" : v < 0.8 ? "angler" : "eel";
    else kind = v < 0.4 ? "angler" : v < 0.65 ? "squid" : v < 0.85 ? "eel" : "jelly";
    const colour =
      kind === "school" ? (v < 0.3 ? "#ffd166" : "#ff9f43") : kind === "fish" ? (f < 0.2 ? "#ff5d8f" : "#4de3ff") : "#000";
    out.push({ frac: f, x: r(), speed: (0.012 + r() * 0.025) * (r() < 0.5 ? -1 : 1), kind, z: 0.6 + r() * 0.6, ph: r() * 6.28, colour });
    f += 0.018 + r() * 0.03;
  }
  return out;
}

/** Pixel size in CSS px. */
const pixel = (w: number) => (w < 640 ? 2 : 3);

export function LandingWorld() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gaugeValue = useRef<HTMLSpanElement>(null);
  const gaugeZone = useRef<HTMLSpanElement>(null);
  const gaugeMarker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduced = prefersReducedMotion();
    const sky: SkyKind = skyKindFor(new Date().getHours());
    const creatures = makeCreatures();
    const r = rand(5);
    const stars = Array.from({ length: 90 }, () => ({ x: r(), y: r() * 0.75, tw: r() * 6, big: r() < 0.08 }));
    const clouds = Array.from({ length: 8 }, (_, i) => ({ x: r(), y: 0.25 + r() * 0.55, w: 22 + r() * 34, layer: i % 3 }));
    const glows: Glow[] = Array.from({ length: 70 }, () => ({ x: r(), frac: 0.4 + r() * 0.58, ph: r() * 6.28, c: r() < 0.6 ? "#4de3ff" : "#9d7bff" }));
    const kelp = Array.from({ length: 14 }, (_, i) => ({ x: (i + r() * 0.6) / 14, h: 10 + r() * 22, ph: r() * 6 }));

    let W = 0; // CSS px
    let H = 0;
    let P = 3;
    let w = 0; // canvas px
    let h = 0;
    let specks: Speck[] = [];
    const frame: WorldFrame = { viewH: 800, maxScroll: 1 };
    const mouse = { x: 0.5, y: 0.45, tx: 0.5, ty: 0.45, has: false };
    let cam = window.scrollY * CAMERA_SPEED;
    let prevCam = cam;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let lastGauge = "";

    const measure = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      P = pixel(W);
      w = Math.ceil(W / P);
      h = Math.ceil(H / P);
      canvas.width = w;
      canvas.height = h;
      frame.viewH = H;
      frame.maxScroll = Math.max(1, document.documentElement.scrollHeight - H);
      specks = Array.from({ length: Math.round((w * h) / 380) }, () => ({ x: Math.random() * w, y: Math.random() * h, z: 0.3 + Math.random() * 0.8, ph: Math.random() * 6.28 }));
    };

    const draw = (dt: number) => {
      const target = window.scrollY * CAMERA_SPEED;
      cam = reduced ? target : cam + (target - cam) * Math.min(1, dt * 7);
      const camDelta = (cam - prevCam) / P;
      prevCam = cam;
      mouse.x += (mouse.tx - mouse.x) * (reduced ? 1 : Math.min(1, dt * 4));
      mouse.y += (mouse.ty - mouse.y) * (reduced ? 1 : Math.min(1, dt * 4));
      const mx = (mouse.x - 0.5) * 2; // −1..1
      const my = (mouse.y - 0.5) * 2;
      const y0 = waterlineY(frame);
      const yb = seabedY(frame);
      const worldOf = (row: number) => row * P + cam; // CSS world y of a canvas row
      const rowOf = (worldY: number) => (worldY - cam) / P;
      const wl = rowOf(y0);

      // ── sky and water, one posterized band per 2 rows ──
      for (let y = 0; y < h; y += 2) {
        const wy = worldOf(y);
        const c = wy < y0 ? rampRgb(SKY_STOPS[sky], wy / y0) : waterAt(depthFraction(wy, frame));
        ctx.fillStyle = css(c);
        ctx.fillRect(0, y, w, 2);
      }

      // ── sky details (only while the sky is on screen) ──
      if (wl > 0) {
        const skyRows = y0 / P;
        if (sky !== "day") {
          for (const s of stars) {
            const sy = Math.round(s.y * skyRows - cam / P - my * 2);
            if (sy < 0 || sy > wl - 6) continue;
            const a = (sky === "night" ? 1 : 0.55) * (0.25 + 0.55 * Math.abs(Math.sin(t * 0.9 + s.tw)));
            ctx.fillStyle = `rgba(255,255,255,${a.toFixed(2)})`;
            const sx = Math.round(s.x * w - mx * 2);
            ctx.fillRect(sx, sy, 1, 1);
            if (s.big && a > 0.5) {
              ctx.fillRect(sx - 1, sy, 3, 1);
              ctx.fillRect(sx, sy - 1, 1, 3);
            }
          }
        }
        // moon / sun
        const discX = Math.round(w * 0.78 - mx * 4);
        const discY = Math.round(skyRows * 0.28 - cam / P / 1.6 - my * 3);
        ctx.fillStyle = sky === "day" ? "rgba(255,231,150,.18)" : "rgba(220,230,255,.12)";
        ctx.fillRect(discX - 8, discY - 8, 16, 16);
        ctx.fillStyle = sky === "day" ? "#ffe596" : sky === "dusk" ? "#ffb38a" : "#e6ecff";
        ctx.fillRect(discX - 5, discY - 4, 10, 8);
        ctx.fillRect(discX - 4, discY - 5, 8, 10);
        if (sky === "night") {
          ctx.fillStyle = "rgba(160,170,210,.6)";
          ctx.fillRect(discX - 2, discY - 2, 2, 2);
          ctx.fillRect(discX + 2, discY + 1, 1, 1);
        }
        // clouds, three parallax layers
        const cloudCol = sky === "day" ? ["#5d93c7", "#76a8d6", "#a9cdea"] : sky === "dusk" ? ["#3e2852", "#5a3a6e", "#8a5478"] : ["#151a40", "#1d2350", "#2a3266"];
        for (const c of clouds) {
          if (!reduced) c.x += (0.004 + c.layer * 0.003) * dt;
          if (c.x > 1.25) c.x = -0.25;
          const depth = (c.layer + 1) * 3;
          const cx = Math.round(c.x * (w + 80) - 40 - mx * depth);
          const cy = Math.round(c.y * skyRows - cam / P / (1.4 - c.layer * 0.15) - my * depth * 0.5);
          if (cy > wl - 4 || cy < -20) continue;
          const cw = Math.round(c.w);
          const ch = Math.max(4, Math.round(cw / 5));
          ctx.fillStyle = cloudCol[c.layer];
          ctx.fillRect(cx, cy + ch / 2, cw, ch / 2);
          ctx.fillRect(cx + cw * 0.15, cy + ch / 4, cw * 0.5, ch / 2);
          ctx.fillRect(cx + cw * 0.35, cy, cw * 0.35, ch / 2);
          ctx.fillRect(cx + cw * 0.6, cy + ch / 4, cw * 0.25, ch / 2);
        }
        // birds (not at night)
        if (sky !== "night") {
          for (let i = 0; i < 3; i++) {
            const bx = Math.round((((t * (6 + i)) / w + i * 0.31) % 1.2) * w - 10 - mx * 4);
            const by = Math.round(skyRows * (0.32 + i * 0.05) - cam / P + Math.sin(t + i) * 2);
            if (by > wl - 4) continue;
            const flap = Math.sin(t * 8 + i) > 0 ? -1 : 1;
            ctx.fillStyle = "rgba(10,13,28,.75)";
            ctx.fillRect(bx, by, 1, 1);
            ctx.fillRect(bx - 1, by + flap, 1, 1);
            ctx.fillRect(bx + 1, by + flap, 1, 1);
            ctx.fillRect(bx - 2, by + flap * 2, 1, 1);
            ctx.fillRect(bx + 2, by + flap * 2, 1, 1);
          }
        }
        // waves on the waterline + the boat
        ctx.fillStyle = sky === "day" ? "rgba(255,255,255,.55)" : "rgba(255,190,210,.3)";
        for (let x = 0; x < w; x += 2) {
          const wy = Math.round(wl + (reduced ? 0 : Math.sin(x / 8 + t * 1.4) * 0.9 + Math.sin(x / 23 - t * 0.6)));
          ctx.fillRect(x, wy, 2, 1);
        }
        const boatX = Math.round(w * (W < 640 ? 0.62 : 0.7) - mx * 3);
        const bob = reduced ? 0 : Math.round(Math.sin(t * 1.6));
        const boatPal = { k: "#0b0f1c", p: "#ff5d8f", f: "#ff5d8f", w: "#ffd166" };
        drawSprite(ctx, !reduced && Math.floor(t * 2.5) % 2 ? BOAT_ALT : BOAT, boatPal, boatX, Math.round(wl) - BOAT.length + 3 + bob);
      }

      // ── light rays under the surface ──
      const camFrac = depthFraction(cam + H * 0.5, frame);
      const rayA = Math.max(0, 1 - camFrac * 4);
      if (rayA > 0.02) {
        const top = Math.max(0, wl);
        for (let i = 0; i < 6; i++) {
          const sway = reduced ? 0 : Math.sin(t * 0.35 + i * 1.7) * 5;
          const x0 = w * (0.08 + i * 0.17) + sway - mx * 5;
          const g = ctx.createLinearGradient(0, top, 0, top + h);
          g.addColorStop(0, `rgba(180,220,255,${0.08 * rayA})`);
          g.addColorStop(1, "rgba(180,220,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x0, top);
          ctx.lineTo(x0 + 9, top);
          ctx.lineTo(x0 + 46, top + h);
          ctx.lineTo(x0 + 18, top + h);
          ctx.fill();
        }
      }

      // ── creatures (world-attached, parallax by z and the cursor) ──
      for (const c of creatures) {
        const wy = y0 + c.frac * (yb - y0);
        const sy = rowOf(wy) - my * c.z * 3;
        if (sy < wl + 3 || sy < -40 || sy > h + 40) continue;
        if (!reduced) c.x = (((c.x + c.speed * dt * c.z) % 1.3) + 1.3) % 1.3;
        const sx = c.x * (w + 60) - 30 - mx * c.z * 6;
        const flip = c.speed > 0;
        const base = waterAt(c.frac);
        const sil = css([base[0] * 0.35, base[1] * 0.42, base[2] * 0.55], 0.6 + c.z * 0.3);
        if (c.kind === "school") {
          for (let k = 0; k < 6; k++) {
            const ox = (k % 3) * 8 + (k > 2 ? 4 : 0);
            const oy = Math.floor(k / 3) * 5 + (reduced ? 0 : Math.round(Math.sin(t * 2 + k + c.ph)));
            drawSprite(ctx, SMALL_FISH, { x: c.colour }, sx + ox, sy + oy, { flip, alpha: 0.75 });
          }
        } else if (c.kind === "fish") {
          drawSprite(ctx, FISH, { x: c.frac < 0.25 ? c.colour : sil }, sx, sy, { flip, alpha: c.frac < 0.25 ? 0.8 : 1 });
        } else if (c.kind === "whale") {
          drawSprite(ctx, WHALE, { x: sil, l: css([base[0] * 0.6, base[1] * 0.7, base[2] * 0.8], 0.7), w: "rgba(255,255,255,.5)" }, sx, sy, { flip: !flip, scale: 2 });
        } else if (c.kind === "jelly") {
          const yy = sy + (reduced ? 0 : Math.sin(t * 0.8 + c.ph) * 3);
          drawSprite(ctx, Math.floor(t * 2 + c.ph) % 2 ? JELLY_A : JELLY_B, { x: `rgba(190,150,255,${0.25 + 0.25 * c.z})` }, sx, yy);
        } else if (c.kind === "angler") {
          drawSprite(ctx, ANGLER_SIL, { x: sil }, sx, sy, { flip });
          const lx = flip ? sx + 2 : sx + ANGLER_SIL[0].length - 3;
          const pulse = 0.6 + 0.4 * Math.sin(t * 3 + c.ph);
          ctx.fillStyle = `rgba(255,209,102,${0.1 * pulse})`;
          ctx.fillRect(lx - 3, sy - 3, 7, 7);
          ctx.fillStyle = `rgba(255,209,102,${0.95 * pulse})`;
          ctx.fillRect(lx, sy, 1, 1);
        } else if (c.kind === "eel") {
          drawSprite(ctx, EEL, { x: sil }, sx, sy + (reduced ? 0 : Math.round(Math.sin(t + c.ph))), { flip });
        } else {
          drawSprite(ctx, SQUID, { x: css([base[0] * 0.3, base[1] * 0.3, base[2] * 0.45], 0.8) }, sx, sy, { scale: 3, flip });
        }
      }

      // ── bioluminescence in the deep ──
      for (const g of glows) {
        const sy = rowOf(y0 + g.frac * (yb - y0)) - my * 2;
        if (sy < 0 || sy > h) continue;
        const a = 0.15 + 0.55 * Math.max(0, Math.sin(t * 1.3 + g.ph));
        ctx.fillStyle = g.c;
        ctx.globalAlpha = a;
        ctx.fillRect(Math.round(g.x * w - mx * 3), Math.round(sy), 1, 1);
      }
      ctx.globalAlpha = 1;

      // ── the seabed ──
      const sb = rowOf(yb);
      if (sb < h + 30) {
        for (let x = 0; x < w; x++) {
          const bump = Math.round(Math.sin(x * 0.07) * 2 + Math.sin(x * 0.23 + 1) * 1.5 + (x % 37 < 6 ? -3 : 0));
          ctx.fillStyle = "#151325";
          ctx.fillRect(x, sb + bump, 1, h);
          ctx.fillStyle = "#24203a";
          ctx.fillRect(x, sb + bump, 1, 1);
        }
        for (const k of kelp) {
          const kx = Math.round(k.x * w - mx * 4);
          for (let s = 0; s < k.h; s++) {
            const sway = reduced ? 0 : Math.round(Math.sin(t * 1.2 + k.ph + s * 0.25) * (s / k.h) * 3);
            ctx.fillStyle = s % 4 === 0 ? "#2f8a6a" : "#1f6b5a";
            ctx.fillRect(kx + sway, Math.round(sb - s), 1, 1);
          }
        }
        // treasure chest with a glint
        const chX = Math.round(w * 0.24 - mx * 3);
        drawSprite(ctx, CHEST, { y: "#ffd166", n: "#7a4a1e", w: "#fff6c8" }, chX, Math.round(sb - CHEST.length + 2));
        if (!reduced && Math.sin(t * 2) > 0.92) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(chX + 2, Math.round(sb - CHEST.length + 1), 1, 1);
        }
        // a vent with rising bubbles
        const vx = Math.round(w * 0.82 - mx * 3);
        ctx.fillStyle = "#0d0b18";
        ctx.fillRect(vx, Math.round(sb - 9), 5, 10);
        ctx.fillRect(vx - 1, Math.round(sb - 4), 7, 5);
        for (let i = 0; i < 5; i++) {
          const by = sb - 10 - (((t * 14 + i * 9) % 40) | 0);
          ctx.fillStyle = "rgba(160,220,255,.45)";
          ctx.fillRect(vx + 2 + Math.round(Math.sin(t * 3 + i) * 1.5), Math.round(by), 1, 1);
        }
      }

      // ── marine snow: drifts with the camera ──
      ctx.fillStyle = "#cfe6ff";
      for (const s of specks) {
        if (!reduced) {
          s.y -= camDelta * s.z;
          s.y += 2 * s.z * dt;
          s.ph += dt;
          s.x += Math.sin(s.ph * 0.7) * 0.03;
        } else s.y -= camDelta * s.z;
        if (s.y < 0) s.y += h;
        else if (s.y > h) s.y -= h;
        if (s.y < wl + 2) continue;
        ctx.globalAlpha = 0.1 + s.z * 0.25;
        ctx.fillRect(Math.round(s.x - mx * s.z * 3), Math.round(s.y), 1, 1 + Math.min(4, Math.round(Math.abs(camDelta * s.z))));
      }
      ctx.globalAlpha = 1;

      // ── the deep closes in; the cursor is a lantern ──
      const dark = Math.max(0, Math.min(0.82, (camFrac - 0.3) * 1.5));
      if (dark > 0.01) {
        const lx = (mouse.has ? mouse.x : 0.5) * w;
        const ly = (mouse.has ? mouse.y : 0.45) * h;
        const R = Math.max(w, h) * 0.32;
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        g.addColorStop(0, "rgba(2,4,10,0)");
        g.addColorStop(0.55, `rgba(2,4,10,${dark * 0.55})`);
        g.addColorStop(1, `rgba(2,4,10,${dark})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, Math.max(0, Math.floor(wl)), w, h);
        ctx.globalCompositeOperation = "lighter";
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 0.45);
        glow.addColorStop(0, `rgba(255,200,90,${0.12 * dark})`);
        glow.addColorStop(1, "rgba(255,200,90,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
        ctx.globalCompositeOperation = "source-over";
      }

      // ── the gauge ──
      const centreWorld = cam + H * 0.5;
      const metres = metresAt(depthFraction(centreWorld, frame));
      const alt = altitudeAt(centreWorld, frame);
      const text = formatGauge(metres, alt);
      if (text !== lastGauge) {
        lastGauge = text;
        if (gaugeValue.current) gaugeValue.current.textContent = text;
        if (gaugeZone.current) gaugeZone.current.textContent = alt > 0 ? "The sky" : metres === 0 ? "The surface" : zoneAt(metres);
      }
      if (gaugeMarker.current) {
        const p = Math.min(1, Math.max(0, window.scrollY / frame.maxScroll));
        gaugeMarker.current.style.transform = `translateY(${(p * 100).toFixed(2)}%)`;
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      draw(dt);
    };
    const once = () => draw(1);

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouse.tx = e.clientX / window.innerWidth;
      mouse.ty = e.clientY / window.innerHeight;
      mouse.has = true;
      if (reduced) once();
    };
    const onResize = () => {
      measure();
      if (reduced) once();
    };
    const ro = new ResizeObserver(() => {
      frame.maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      if (reduced) once();
    });
    ro.observe(document.body);

    measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onMove, { passive: true });
    if (reduced) {
      window.addEventListener("scroll", once, { passive: true });
      once();
    } else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", once);
    };
  }, []);

  return (
    <BackdropPortal>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 h-full w-full [image-rendering:pixelated]"
      />
      <div aria-hidden="true" className="pointer-events-none fixed top-1/2 right-3 z-0 hidden -translate-y-1/2 items-center gap-2 lg:flex">
        <div className="flex flex-col items-end text-right">
          <span ref={gaugeValue} className="font-hud text-2xl leading-none text-signal glow-signal">
            +300 m
          </span>
          <span ref={gaugeZone} className="mt-1 font-display text-[11px] tracking-[0.2em] text-muted uppercase">
            The sky
          </span>
        </div>
        <div className="relative h-56 w-3">
          <div
            className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2"
            style={{ background: "repeating-linear-gradient(180deg, rgba(154,166,200,.55) 0 2px, transparent 2px 14px)" }}
          />
          <div className="absolute inset-x-0 top-0 h-full">
            <span ref={gaugeMarker} className="absolute top-0 left-0 block h-full w-full">
              <span className="absolute -top-1 left-0 block h-2 w-3 bg-accent shadow-[0_0_8px_var(--accent)]" />
            </span>
          </div>
        </div>
      </div>
    </BackdropPortal>
  );
}
