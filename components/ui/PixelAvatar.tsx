"use client";
import { useState } from "react";
import { sfx } from "@/lib/ui/sfx";
import { AVATARS, avatarById, type AvatarId } from "./avatars";
import { PixelSprite } from "./PixelSprite";

type Props = {
  id: AvatarId | string;
  size?: number;
  /** Bob and wave on hover (default true). */
  bob?: boolean;
  /** Use this photo (e.g. the Clerk image) instead of the pixel avatar. */
  imageUrl?: string | null;
  alt?: string;
  className?: string;
};

/** A Player's avatar: one of 16 self-drawn pixel characters on a tinted tile, or their photo. */
export function PixelAvatar({ id, size = 64, bob = true, imageUrl, alt, className = "" }: Props) {
  const a = avatarById(id);
  const label = alt ?? a.name;
  return (
    <span
      className={`group relative inline-grid shrink-0 place-items-center overflow-hidden rounded-md ${className}`}
      style={{ width: size, height: size, background: imageUrl ? "var(--surface-2)" : a.bg }}
      role="img"
      aria-label={label}
    >
      {imageUrl ? (
        // Clerk-hosted photo; next/image would need remote host config for a 64px thumbnail.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        <>
          <span
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1/4"
            style={{ background: "linear-gradient(transparent, rgba(0,0,0,.25))" }}
          />
          <span
            className={bob ? "transition-transform duration-300 group-hover:[animation:avatar-wave_.9s_ease-in-out_infinite]" : ""}
            style={{ transformOrigin: "50% 90%" }}
          >
            <PixelSprite rows={a.rows} palette={a.palette} size={size * 0.78} />
          </span>
        </>
      )}
    </span>
  );
}

/** A grid of all 16 avatars for the profile card's Edit flow. */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (id: AvatarId) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <div role="radiogroup" aria-label="Choose your avatar" className="grid grid-cols-4 gap-3 sm:grid-cols-8">
        {AVATARS.map((a) => {
          const selected = a.id === value;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={a.name}
              onMouseEnter={() => {
                setHover(a.name);
                sfx.hover();
              }}
              onMouseLeave={() => setHover(null)}
              onClick={() => {
                sfx.pop();
                onChange(a.id);
              }}
              className={`rounded-md p-0.5 transition ${selected ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-signal"}`}
            >
              <PixelAvatar id={a.id} size={56} />
            </button>
          );
        })}
      </div>
      <p className="mt-2 h-5 font-display text-sm text-muted" aria-live="polite">
        {hover ?? avatarById(value).name}
      </p>
    </div>
  );
}
