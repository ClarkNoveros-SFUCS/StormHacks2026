"use client";
import { sfx, useSfxMuted } from "@/lib/ui/sfx";
import { PixelIcon } from "./PixelIcon";

/** The mute tile. Persists in localStorage['sfx-muted']. */
export function SoundToggle({ className = "" }: { className?: string }) {
  const [muted] = useSfxMuted();
  return (
    <button
      type="button"
      onClick={() => sfx.toggleMuted()}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Sound off" : "Sound on"}
      className={`grid h-9 w-9 place-items-center rounded-sm border border-border bg-surface transition hover:border-signal ${className}`}
    >
      <PixelIcon name={muted ? "mute" : "sound"} size={18} />
    </button>
  );
}
