// Synthesized sound (WebAudio, no files). Client-only; every call is a no-op on the server,
// while muted, or before the first user gesture unlocks audio.
// Spec: docs/design/design-system.md § Sound. Mute flag: localStorage['sfx-muted'] ("1" = muted).
import { useSyncExternalStore } from "react";

export type Band = 1 | 2 | 3 | 4;
export type SfxEvent =
  | "hover"
  | "click"
  | "toggle"
  | "pop"
  | "whoosh"
  | "reward"
  | "levelUp"
  | "error"
  | "correct"
  | "wrong"
  | "ping"
  | "timeout"
  | "tick"
  | "count"
  | "sink"
  | "catch"
  | "laser"
  | "shatter"
  | "blast";

const KEY = "sfx-muted";
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let unlocked = false;
const listeners = new Set<() => void>();
let lastHover = 0;

if (typeof window !== "undefined") {
  try {
    muted = window.localStorage.getItem(KEY) === "1";
  } catch {
    muted = false;
  }
  const unlock = () => {
    sfx.unlock();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function ac(): AudioContext | null {
  if (!unlocked || muted || !ctx || !master) return null;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

type ToneOpts = {
  freq: number;
  to?: number; //       slide target (Hz)
  dur?: number; //      seconds
  type?: OscillatorType;
  gain?: number;
  at?: number; //       delay (s)
  attack?: number;
};

function tone({ freq, to, dur = 0.12, type = "square", gain = 0.08, at = 0, attack = 0.005 }: ToneOpts) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise({ dur = 0.2, gain = 0.06, at = 0, freq = 1200, q = 0.8, type = "bandpass" as BiquadFilterType }) {
  const c = ac();
  if (!c || !master) return;
  const t0 = c.currentTime + at;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// Pentatonic-ish note table for chimes
const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, E6: 1318.5, G6: 1568 };

function emit() {
  for (const l of listeners) l();
}

export const sfx = {
  /** Create the AudioContext. Called automatically on the first pointerdown/keydown. */
  unlock() {
    if (typeof window === "undefined" || unlocked) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    unlocked = true;
  },
  isMuted: () => muted,
  setMuted(value: boolean) {
    muted = value;
    try {
      window.localStorage.setItem(KEY, value ? "1" : "0");
    } catch {
      /* private mode */
    }
    emit();
  },
  toggleMuted() {
    sfx.setMuted(!muted);
    if (!muted) sfx.toggle();
  },
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  // ── Site ──
  hover() {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    if (now - lastHover < 60) return;
    lastHover = now;
    tone({ freq: 1400, dur: 0.035, type: "sine", gain: 0.018 });
  },
  click() {
    tone({ freq: 520, to: 780, dur: 0.06, type: "square", gain: 0.04 });
  },
  toggle() {
    tone({ freq: 660, dur: 0.05, type: "triangle", gain: 0.05 });
    tone({ freq: 990, dur: 0.07, type: "triangle", gain: 0.05, at: 0.05 });
  },
  pop() {
    tone({ freq: 300, to: 900, dur: 0.08, type: "sine", gain: 0.07 });
  },
  whoosh() {
    noise({ dur: 0.3, gain: 0.05, freq: 900, q: 0.6 });
  },
  reward() {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => tone({ freq: f, dur: 0.18, type: "triangle", gain: 0.06, at: i * 0.07 }));
    tone({ freq: NOTE.E6, dur: 0.4, type: "sine", gain: 0.03, at: 0.3 });
  },
  levelUp() {
    [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) =>
      tone({ freq: f, dur: 0.16, type: "square", gain: 0.04, at: i * 0.08 }),
    );
    noise({ dur: 0.6, gain: 0.02, freq: 6000, q: 0.5, type: "highpass", at: 0.4 });
  },
  error() {
    tone({ freq: 220, to: 150, dur: 0.18, type: "sawtooth", gain: 0.05 });
  },

  // ── Dive / game events ──
  /** An Answer scores. Pitched up by band; band 4 adds a sparkle. */
  correct(band: Band = 1) {
    const base = [0, 440, 523.25, 659.25, 783.99][band];
    tone({ freq: base, dur: 0.09, type: "square", gain: 0.06 });
    tone({ freq: base * 1.5, dur: 0.16, type: "square", gain: 0.06, at: 0.08 });
    if (band >= 3) tone({ freq: base * 2, dur: 0.2, type: "triangle", gain: 0.05, at: 0.16 });
    if (band === 4) [0, 1, 2, 3].forEach((i) => tone({ freq: 2000 + i * 400, dur: 0.06, type: "sine", gain: 0.03, at: 0.24 + i * 0.05 }));
  },
  wrong() {
    tone({ freq: 140, to: 70, dur: 0.22, type: "square", gain: 0.07 });
    noise({ dur: 0.08, gain: 0.04, freq: 300, type: "lowpass" });
  },
  ping() {
    tone({ freq: 1320, dur: 0.5, type: "sine", gain: 0.05, attack: 0.002 });
    tone({ freq: 1320, dur: 0.6, type: "sine", gain: 0.015, at: 0.18 });
  },
  timeout() {
    tone({ freq: 440, to: 110, dur: 0.6, type: "sawtooth", gain: 0.05 });
  },
  tick() {
    tone({ freq: 2400, dur: 0.012, type: "square", gain: 0.008 });
  },
  count() {
    tone({ freq: 900 + Math.random() * 200, dur: 0.025, type: "square", gain: 0.02 });
  },
  /** The descent: a soft low whoosh with a falling tone. */
  sink() {
    noise({ dur: 0.9, gain: 0.04, freq: 400, q: 0.7, type: "lowpass" });
    tone({ freq: 300, to: 90, dur: 0.9, type: "sine", gain: 0.04 });
  },
  /** The catch screen appears. */
  catch(band: Band = 1) {
    sfx.correct(band);
    tone({ freq: 196, dur: 0.6, type: "triangle", gain: 0.04, at: 0.1 });
  },

  // ── Arena (F29) ──
  /** A blaster shot: a quick falling zap. */
  laser() {
    tone({ freq: 1800, to: 260, dur: 0.12, type: "square", gain: 0.035, attack: 0.002 });
    noise({ dur: 0.05, gain: 0.025, freq: 4000, type: "highpass" });
  },
  /** A wrong target breaks apart: glassy crackle. */
  shatter() {
    noise({ dur: 0.35, gain: 0.06, freq: 3200, q: 0.8, type: "highpass" });
    [1900, 2600, 1500].forEach((f, i) => tone({ freq: f, to: f * 0.6, dur: 0.09, type: "triangle", gain: 0.03, at: i * 0.04 }));
    tone({ freq: 160, to: 80, dur: 0.2, type: "square", gain: 0.04 });
  },
  /** The right target explodes: a boom plus a rising chime. */
  blast() {
    noise({ dur: 0.7, gain: 0.08, freq: 260, q: 0.6, type: "lowpass" });
    tone({ freq: 90, to: 40, dur: 0.5, type: "sine", gain: 0.12 });
    [NOTE.C5, NOTE.G5, NOTE.C6].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "square", gain: 0.035, at: 0.08 + i * 0.06 }));
  },

  play(event: SfxEvent, band?: Band) {
    if (event === "correct") return sfx.correct(band);
    if (event === "catch") return sfx.catch(band);
    (sfx[event] as () => void)();
  },
};

/** React hook: the mute flag, kept in sync across components. */
export function useSfxMuted(): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(sfx.subscribe, sfx.isMuted, () => false);
  return [value, sfx.setMuted];
}
