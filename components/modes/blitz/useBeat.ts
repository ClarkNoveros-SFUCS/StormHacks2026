"use client";
// Blitz's beat: a synthesized drum-machine loop (lib/ui/sfx.ts `drum`, so it respects mute) and a
// visual pulse in step with it. One grid on the performance clock drives both: the scheduler
// looks ahead and puts each 16th note on the audio clock at the matching moment, and every frame
// writes the pulse (1 on the beat, decaying to 0) to `--beat` on the target element.
// Reduced motion: no pulse (the sound still plays unless muted).
import { useEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { sfx } from "@/lib/ui/sfx";
import { pulseAt, voicesAt, type BeatLayers } from "./beat";

const LOOKAHEAD_MS = 120;

export function useBeat({ active, bpm, layers, target }: { active: boolean; bpm: number; layers: BeatLayers; target: RefObject<HTMLElement | null> }) {
  const layersRef = useRef(layers);
  useEffect(() => {
    layersRef.current = layers;
  }, [layers]);

  useEffect(() => {
    if (!active) return;
    const beatMs = 60_000 / bpm;
    const stepMs = beatMs / 4;
    const t0 = performance.now() + 40;
    let step = 0;

    const schedule = () => {
      const now = performance.now();
      while (t0 + step * stepMs < now + LOOKAHEAD_MS) {
        const at = t0 + step * stepMs;
        const audio = sfx.audioNow();
        // skip notes that are already late (a background tab), never play them in a burst
        if (audio !== null && at >= now - 15) {
          const when = audio + Math.max(0, at - now) / 1000;
          for (const v of voicesAt(step, layersRef.current)) sfx.drum(v.voice, when, v.freq);
        }
        step++;
      }
    };
    schedule();
    const timer = setInterval(schedule, 25);

    let raf = 0;
    const el = target.current;
    const frame = (now: number) => {
      el?.style.setProperty("--beat", pulseAt(now - t0, beatMs).toFixed(3));
      raf = requestAnimationFrame(frame);
    };
    if (!prefersReducedMotion()) raf = requestAnimationFrame(frame);

    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      el?.style.setProperty("--beat", "0");
    };
  }, [active, bpm, target]);
}
