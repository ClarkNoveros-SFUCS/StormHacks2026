"use client";
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/ui/sfx";
import s from "./flip-clock.module.css";
import { clockParts } from "./format";

type Props = {
  /** ISO instant to count down to (DailyToday.nextAt). */
  target: string;
  /** The server's clock when the page was made (DailyToday.serverNow), so a wrong local clock doesn't matter. */
  serverNow: string;
  /** Called once when the countdown reaches zero. */
  onDone?: () => void;
  /** Soft tick sound every second (only if the player has unmuted sound). */
  tick?: boolean;
  className?: string;
};

function Digit({ value }: { value: string }) {
  const prev = useRef(value);
  const [flip, setFlip] = useState<{ from: string; to: string; key: number } | null>(null);

  useEffect(() => {
    if (prev.current === value) return;
    const from = prev.current;
    prev.current = value;
    // Re-keying restarts the flap animation on every change.
    setFlip((f) => ({ from, to: value, key: (f?.key ?? 0) + 1 }));
  }, [value]);

  const old = flip?.from ?? value;
  return (
    <span className={s.digit} aria-hidden="true">
      {/* static: the new value on top, the old one below until the bottom flap lands */}
      <span className={`${s.half} ${s.top}`}>
        <span>{value}</span>
      </span>
      <span className={`${s.half} ${s.bottom}`}>
        <span>{flip ? old : value}</span>
      </span>
      {flip && (
        <span key={flip.key}>
          <span className={`${s.half} ${s.top} ${s.flapTop}`}>
            <span>{flip.from}</span>
          </span>
          <span className={`${s.half} ${s.bottom} ${s.flapBottom}`} onAnimationEnd={() => setFlip(null)}>
            <span>{flip.to}</span>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * The split-flap countdown to the next Daily (decisions §14: "the Daily countdown ticks with a
 * flip clock"). Driven by the server's clock offset. Renders 00:00:00 placeholders until mounted.
 */
export function FlipClock({ target, serverNow, onDone, tick = false, className = "" }: Props) {
  const [ms, setMs] = useState<number | null>(null);
  const done = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const end = Date.parse(target);
    const update = () => {
      const left = end - (Date.now() + offset);
      setMs(Math.max(0, left));
      if (tick) sfx.tick();
      if (left <= 0 && !done.current) {
        done.current = true;
        onDoneRef.current?.();
      }
    };
    const first = setTimeout(update, 0);
    const id = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [target, serverNow, tick]);

  const [hh, mm, ss] = clockParts(ms ?? 0);
  const groups: [string, string][] = [
    [hh, "HRS"],
    [mm, "MIN"],
    [ss, "SEC"],
  ];
  return (
    <div className={`${s.clock} ${className}`} role="timer" aria-live="off" aria-label={ms === null ? "Next Daily countdown" : `Next Daily in ${hh} hours ${mm} minutes ${ss} seconds`}>
      {groups.map(([v, unit], i) => (
        <span key={unit} style={{ display: "contents" }}>
          {i > 0 && (
            <span className={s.colon} aria-hidden="true">
              :
            </span>
          )}
          <span className={s.group}>
            <span className={s.pair}>
              <Digit value={ms === null ? "-" : v[0]} />
              <Digit value={ms === null ? "-" : v[1]} />
            </span>
            <span className={s.unit} aria-hidden="true">
              {unit}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
