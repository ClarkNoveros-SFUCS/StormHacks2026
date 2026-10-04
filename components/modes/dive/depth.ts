// The Dive camera: one depth (metres) shared by the ocean canvas, the depth ruler and the HUD.
// Mapping (CSS px, viewport height H):
//   pxPerMetre = H / 300                 → 100 m ≈ a third of the screen, so the first catch
//                                          scrolls the waterline and the boat out of view
//   anchorY(d) = H × (0.25 + 0.2 × min(1, d / 300))
//                                        → the camera's depth sits 25% down at the surface
//                                          (the waterline) and eases to 45% once you're deep
//   screenY(m) = anchorY(d) + (m − d) × pxPerMetre
import { springStep } from "@/lib/motion/spring";

export function pxPerMetre(viewH: number): number {
  return viewH / 300;
}

export function anchorY(cameraDepth: number, viewH: number): number {
  return viewH * (0.25 + 0.2 * Math.min(1, Math.max(0, cameraDepth) / 300));
}

/** Screen y (CSS px) of world depth `m` when the camera is at `cameraDepth`. Negative m is sky. */
export function screenYOf(m: number, cameraDepth: number, viewH: number): number {
  return anchorY(cameraDepth, viewH) + (m - cameraDepth) * pxPerMetre(viewH);
}

/** World depth (m) at a screen y (CSS px). */
export function depthAtScreenY(y: number, cameraDepth: number, viewH: number): number {
  return cameraDepth + (y - anchorY(cameraDepth, viewH)) / pxPerMetre(viewH);
}

type Listener = (depth: number, velocity: number) => void;

/**
 * A sprung camera depth. `OceanStage` steps it every frame and notifies subscribers
 * (the ruler, the HUD) without React re-renders.
 */
export class DiveCamera {
  depth = 0;
  target = 0;
  velocity = 0;
  stiffness = 60;
  damping = 14;
  private listeners = new Set<Listener>();

  /** Move toward `m` (sprung), or jump there with `instant`. */
  set(m: number, instant = false) {
    this.target = Math.max(0, m);
    if (instant) {
      this.depth = this.target;
      this.velocity = 0;
      this.emit();
    }
  }

  /** Advance by dt seconds. Returns true while moving. */
  step(dt: number, reduced = false): boolean {
    if (reduced) {
      const moved = this.depth !== this.target;
      this.depth = this.target;
      this.velocity = 0;
      if (moved) this.emit();
      return false;
    }
    if (Math.abs(this.depth - this.target) < 0.05 && Math.abs(this.velocity) < 0.5) {
      if (this.depth !== this.target || this.velocity !== 0) {
        this.depth = this.target;
        this.velocity = 0;
        this.emit();
      }
      return false;
    }
    let left = Math.min(dt, 0.064);
    while (left > 0) {
      const s = Math.min(left, 1 / 120);
      [this.depth, this.velocity] = springStep(this.depth, this.velocity, this.target, s, this.stiffness, this.damping, 1);
      left -= s;
    }
    if (this.depth < 0) {
      this.depth = 0;
      this.velocity = Math.max(0, this.velocity);
    }
    this.emit();
    return true;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.depth, this.velocity);
    return () => {
      this.listeners.delete(fn);
    };
  }

  emit() {
    for (const l of this.listeners) l(this.depth, this.velocity);
  }
}
