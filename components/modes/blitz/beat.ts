// Blitz's beat pattern and small pure helpers. Client-safe, no DOM.
import type { BeatVoice } from "@/lib/ui/sfx";

export const BLITZ_BPM = 120;
export const STEPS_PER_BAR = 16;

export type BeatLayers = {
  /** Combo ×2: snare backbeat, bass line and 16th hats. */
  combo: boolean;
  /** The last 10 seconds: a high blip on every beat. */
  hot: boolean;
};

// A minor-ish bass line on 8th notes
const BASS = [55, 55, 82.41, 55, 65.41, 55, 98, 82.41];

/** Which voices play on a 16th-note step (four on the floor, offbeat hats, layers on top). */
export function voicesAt(step: number, layers: BeatLayers): { voice: BeatVoice; freq?: number }[] {
  const s = ((step % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
  const out: { voice: BeatVoice; freq?: number }[] = [];
  if (s % 4 === 0) out.push({ voice: "kick" });
  if (s % 4 === 2) out.push({ voice: "hat" });
  if (layers.combo) {
    if (s === 4 || s === 12) out.push({ voice: "snare" });
    if (s % 2 === 1) out.push({ voice: "hat" });
    if (s % 2 === 0) out.push({ voice: "bass", freq: BASS[s / 2] });
  }
  if (layers.hot && s % 4 === 0) out.push({ voice: "blip", freq: s % 8 === 0 ? 1760 : 1320 });
  return out;
}

/** The pulse for a moment: 1 exactly on a beat, easing to 0 just before the next. */
export function pulseAt(msSinceStart: number, beatMs: number): number {
  const phase = (((msSinceStart % beatMs) + beatMs) % beatMs) / beatMs;
  return Math.pow(1 - phase, 3);
}

/** Lit segments of the 5-step combo meter. */
export function comboSegments(combo: number, comboAt = 5): number {
  return Math.max(0, Math.min(comboAt, combo));
}

/** Correct answers as a whole percentage of those answered (0 when none were). */
export function accuracy(correct: number, answered: number): number {
  return answered > 0 ? Math.round((correct / answered) * 100) : 0;
}
