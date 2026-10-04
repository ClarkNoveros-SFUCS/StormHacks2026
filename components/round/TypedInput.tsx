"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Muted line under the input, e.g. "dijkstr · not in your notes". */
  correction?: string | null;
  /** Increment to play the reject jolt. */
  rejectKey?: number;
  /** The submit button's label (Dive: "DIVE"). Null hides it. */
  submitLabel?: string | null;
  /** Rendered right under the input (the Fuse). */
  below?: ReactNode;
  className?: string;
};

/** Typed answer input for open, cloze and definition Prompts. Enter submits, the box clears, focus stays. */
export function TypedInput({
  onSubmit,
  disabled = false,
  placeholder = "type one answer…",
  correction,
  rejectKey = 0,
  submitLabel = "DIVE",
  below,
  className = "",
}: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus({ preventScroll: true });
  }, [disabled]);

  useEffect(() => {
    if (rejectKey === 0 || prefersReducedMotion()) return;
    boxRef.current?.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-8px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 400, easing: "ease-out" },
    );
  }, [rejectKey]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue("");
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={`min-w-0 flex-1 ${className}`}>
      <form
        className="flex items-stretch gap-2 sm:gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div ref={boxRef} className="min-w-0 flex-1">
          <div
            className="flex h-12 items-center gap-2 px-3 sm:h-14 sm:px-4"
            style={{
              background: "rgba(6,13,26,.92)",
              boxShadow: "inset 0 0 0 2px color-mix(in srgb, var(--signal) 65%, transparent), 0 0 18px color-mix(in srgb, var(--signal) 18%, transparent)",
            }}
          >
            <span aria-hidden="true" className="font-hud text-2xl text-signal">
              &gt;
            </span>
            <input
              ref={inputRef}
              value={value}
              disabled={disabled}
              onChange={(e) => {
                setValue(e.target.value);
                sfx.tick();
              }}
              placeholder={placeholder}
              aria-label="Your answer"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="min-w-0 flex-1 bg-transparent font-hud text-[22px] text-text caret-signal outline-none placeholder:text-faint disabled:opacity-50 sm:text-[26px]"
            />
          </div>
          {below && <div className="mt-1.5">{below}</div>}
        </div>
        {submitLabel && (
          <button
            type="submit"
            disabled={disabled}
            onMouseEnter={() => sfx.hover()}
            className="h-12 shrink-0 px-4 font-hud text-[20px] tracking-[0.2em] text-text transition active:translate-y-[2px] disabled:opacity-50 sm:h-14 sm:px-6 sm:text-[24px]"
            style={{
              background: "color-mix(in srgb, var(--accent) 45%, #2a0c18)",
              boxShadow: "inset 0 0 0 2px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 35%, transparent), 0 4px 0 #3b0f22",
            }}
          >
            {submitLabel}
          </button>
        )}
      </form>
      <p className="mt-1 min-h-[22px] font-hud text-[16px] text-muted sm:text-[18px]" aria-live="polite">
        {correction ?? ""}
      </p>
    </div>
  );
}
