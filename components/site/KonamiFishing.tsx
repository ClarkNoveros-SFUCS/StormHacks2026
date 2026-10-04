"use client";
import { useEffect, useRef, useState } from "react";
import { BOAT, drawSprite, FISH, MASCOT, MASCOT_PAL } from "@/components/modes/dive/ocean-art";
import { Button } from "@/components/ui";
import { burstFrom, confettiRain } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";

// Easter egg (design-system §2.5): ↑ ↑ ↓ ↓ ← → ← → B A drops a tiny fishing game.
const CODE = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
const GOAL = 3;

/** Listens for the Konami code anywhere on the site (not while typing) and opens the game. */
export function KonamiFishing() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let pos = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      const k = e.key.toLowerCase();
      pos = k === CODE[pos] ? pos + 1 : k === CODE[0] ? 1 : 0;
      if (pos === CODE.length) {
        pos = 0;
        sfx.reward();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return open ? <FishingGame onClose={() => setOpen(false)} /> : null;
}

const W = 160;
const H = 100;
const SURFACE = 20;
const FISH_COLOURS = ["#ff5d8f", "#ffd166", "#4de3ff", "#9d7bff", "#3ddc97", "#ff9f43"];

type Fish = { x: number; y: number; vx: number; colour: string; hooked: boolean };

function FishingGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [caught, setCaught] = useState(0);
  const won = caught >= GOAL;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  // Escape closes; focus moves into the dialog and back out.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const hook = { x: W / 2, y: 50, tx: W / 2, ty: 50 };
    const keys = new Set<string>();
    let fish: Fish[] = [];
    let reeling = false;
    let count = 0;
    let raf = 0;
    let last = performance.now();
    let t = 0;
    let spawnIn = 0;

    const toLocal = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      hook.tx = ((e.clientX - r.left) / r.width) * W;
      hook.ty = ((e.clientY - r.top) / r.height) * H;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        keys.add(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);
    canvas.addEventListener("pointermove", toLocal);
    canvas.addEventListener("pointerdown", toLocal);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;

      // input
      const kx = (keys.has("ArrowRight") ? 1 : 0) - (keys.has("ArrowLeft") ? 1 : 0);
      const ky = (keys.has("ArrowDown") ? 1 : 0) - (keys.has("ArrowUp") ? 1 : 0);
      hook.tx += kx * 70 * dt;
      hook.ty += ky * 70 * dt;
      hook.tx = Math.max(4, Math.min(W - 4, hook.tx));
      hook.ty = Math.max(SURFACE + 3, Math.min(H - 4, hook.ty));
      if (reeling) {
        hook.y -= 55 * dt;
        if (hook.y <= SURFACE - 2) {
          reeling = false;
          fish = fish.filter((f) => !f.hooked);
          count += 1;
          setCaught(count);
          sfx.reward();
          burstFrom(canvas, { kind: "bubble", count: 14, spread: 200 });
          if (count >= GOAL) {
            sfx.levelUp();
            confettiRain(90);
          }
          hook.y = SURFACE + 4;
        }
      } else if (count < GOAL) {
        hook.x += (hook.tx - hook.x) * Math.min(1, dt * 8);
        hook.y += (hook.ty - hook.y) * Math.min(1, dt * 8);
      }

      // fish
      spawnIn -= dt;
      if (spawnIn <= 0 && fish.length < 5 && count < GOAL) {
        const left = Math.random() < 0.5;
        fish.push({
          x: left ? -10 : W + 1,
          y: SURFACE + 10 + Math.random() * (H - SURFACE - 18),
          vx: (left ? 1 : -1) * (12 + Math.random() * 16),
          colour: FISH_COLOURS[Math.floor(Math.random() * FISH_COLOURS.length)],
          hooked: false,
        });
        spawnIn = 0.9 + Math.random() * 1.2;
      }
      for (const f of fish) {
        if (f.hooked) {
          f.x = hook.x - 4;
          f.y = hook.y + 1;
          continue;
        }
        f.x += f.vx * dt;
        f.y += Math.sin(t * 2 + f.x * 0.1) * 0.08;
        if (!reeling && count < GOAL && hook.x >= f.x - 1 && hook.x <= f.x + 10 && hook.y >= f.y - 1 && hook.y <= f.y + 6) {
          f.hooked = true;
          reeling = true;
          sfx.correct(3);
        }
      }
      fish = fish.filter((f) => f.hooked || (f.x > -14 && f.x < W + 14));

      // draw: sky, water, boat + Lumen, line, fish
      const sky = ctx.createLinearGradient(0, 0, 0, SURFACE);
      sky.addColorStop(0, "#11163a");
      sky.addColorStop(1, "#4a2a5e");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, SURFACE);
      const sea = ctx.createLinearGradient(0, SURFACE, 0, H);
      sea.addColorStop(0, "#214d7a");
      sea.addColorStop(1, "#060d1c");
      ctx.fillStyle = sea;
      ctx.fillRect(0, SURFACE, W, H - SURFACE);
      ctx.fillStyle = "rgba(255,255,255,.35)";
      for (let x = 0; x < W; x += 2) ctx.fillRect(x, SURFACE + Math.round(Math.sin(x / 7 + t * 2) * 0.8), 2, 1);
      ctx.fillStyle = "rgba(255,255,255,.7)";
      [12, 40, 77, 120, 148].forEach((x, i) => ctx.fillRect(x, 3 + (i % 3) * 3, 1, 1));

      const boatX = 66;
      const boatY = SURFACE - BOAT.length + 3 + Math.round(Math.sin(t * 1.6));
      drawSprite(ctx, BOAT, { k: "#0b0f1c", p: "#ff5d8f", f: "#ff5d8f", w: "#3b4a63" }, boatX, boatY);
      drawSprite(ctx, MASCOT, MASCOT_PAL, boatX + 10, boatY - 4, { scale: 0.7 });
      const rodX = boatX + 24;
      const rodY = boatY - 1;
      ctx.strokeStyle = "rgba(230,240,255,.7)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(rodX, rodY);
      ctx.lineTo(hook.x, hook.y);
      ctx.stroke();
      ctx.fillStyle = "#d6deef";
      ctx.fillRect(Math.round(hook.x), Math.round(hook.y), 1, 2);
      ctx.fillRect(Math.round(hook.x) - 1, Math.round(hook.y) + 2, 2, 1);

      for (const f of fish) drawSprite(ctx, FISH, { x: f.colour }, f.x, f.y, { flip: f.vx > 0 });
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", toLocal);
      canvas.removeEventListener("pointerdown", toLocal);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4" role="presentation">
      <div className="absolute inset-0 bg-[#03050c]/80 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Secret fishing game"
        tabIndex={-1}
        className="card relative w-full max-w-[680px] border-border-strong bg-surface p-4 shadow-2xl outline-none"
        style={{ animation: "pop-in .35s var(--ease-snap) both" }}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-lg text-reward">Lumen&apos;s fishing hole</h2>
          <span className="font-hud text-2xl text-signal" aria-live="polite">
            {Math.min(caught, GOAL)} / {GOAL} fish
          </span>
        </div>
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          aria-label="Move the hook with your mouse, finger or the arrow keys. Touch a fish to hook it."
          className="block aspect-[8/5] w-full cursor-crosshair touch-none rounded-sm [image-rendering:pixelated]"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {won ? "Three fish! Lumen is impressed." : "Move the hook with your mouse or the arrow keys. Touch a fish to hook it."}
          </p>
          <Button variant={won ? "primary" : "ghost"} size="sm" onClick={onClose}>
            {won ? "Nice, close" : "Close"}
          </Button>
        </div>
      </div>
    </div>
  );
}
