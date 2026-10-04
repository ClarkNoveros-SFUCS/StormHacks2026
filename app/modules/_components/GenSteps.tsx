"use client";
import { useEffect, useState } from "react";
import s from "./modules.module.css";

// The generator reports only "generating", not which stage it is in, so the
// steps advance on elapsed time. `at` is roughly when each stage starts.
const STEPS = [
  { at: 0, label: "Reading your files" },
  { at: 5, label: "Spotting the key ideas" },
  { at: 12, label: "Writing prompts" },
  { at: 30, label: "Checking every answer" },
  { at: 48, label: "Picking the best ones" },
] as const;

function useElapsed(since: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
}

function stepAt(sec: number) {
  let i = 0;
  while (i + 1 < STEPS.length && sec >= STEPS[i + 1].at) i++;
  return i;
}

function Dots() {
  return (
    <span className={s.writing} aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

/** One line of text that rolls to the next step, with a counter and progress ticks. */
export function GenSteps({ since }: { since: string }) {
  const sec = useElapsed(since);
  const cur = stepAt(sec);
  return (
    <div className="flex items-center gap-3 rounded-sm bg-bg-2/60 px-3 py-2" role="status" aria-live="polite">
      <span className="font-hud text-sm leading-none text-faint tabular-nums">
        {cur + 1}/{STEPS.length}
      </span>
      <span className="relative h-5 min-w-0 flex-1 overflow-hidden">
        <span key={cur} className={`${s.stepRoll} absolute inset-0 truncate text-sm text-muted`}>
          {STEPS[cur].label}
          <Dots />
        </span>
      </span>
      <span className="hidden gap-1 sm:flex" aria-hidden="true">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 w-3 rounded-[1px] transition-colors duration-500 ${
              i < cur ? "bg-signal" : i === cur ? s.tickNow : "bg-border"
            }`}
          />
        ))}
      </span>
    </div>
  );
}
