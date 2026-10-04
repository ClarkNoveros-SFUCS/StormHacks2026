"use client";
import Link from "next/link";
import { Button } from "./Button";
import { Odometer } from "./Odometer";
import { PixelAvatar } from "./PixelAvatar";
import { PixelIcon } from "./PixelIcon";
import { StreakFlame } from "./StreakFlame";

export type ProfileCardProps = {
  name: string;
  level: number;
  avatarId: string;
  /** Show this photo instead of the pixel avatar (the Clerk-photo toggle). */
  imageUrl?: string | null;
  totalXp: number;
  /** Ocean rank name, e.g. "Shrimp". */
  rank: string;
  badges: number;
  /** Day streak. */
  streak: number;
  /** Played today (lights the flame). */
  streakActive?: boolean;
  /** Where "Edit" goes; or pass onEdit to open the AvatarPicker in place. Omit both to hide Edit. */
  editHref?: string;
  onEdit?: () => void;
  profileHref: string;
  className?: string;
};

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center">{icon}</span>
      <div className="min-w-0 leading-tight">
        <div className="font-display text-[17px] text-text">{value}</div>
        <div className="truncate text-[12px] text-muted">{label}</div>
      </div>
    </div>
  );
}

/**
 * The Codedex-style profile card: pixel avatar with Edit, name + Level, a 2×2 of icon stats
 * (Total XP, Rank, Badges, Day streak) and a full-width View profile button, in a dark card
 * with a stepped 2px grey pixel border. Data via props (F21 provides it).
 */
export function ProfileCard({
  name,
  level,
  avatarId,
  imageUrl,
  totalXp,
  rank,
  badges,
  streak,
  streakActive = true,
  editHref,
  onEdit,
  profileHref,
  className = "",
}: ProfileCardProps) {
  return (
    <section aria-label={`${name}'s profile`} className={`px-frame m-[2px] bg-[#0d1124] p-5 ${className}`}>
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <PixelAvatar id={avatarId} imageUrl={imageUrl} size={72} alt={`${name}'s avatar`} />
          {onEdit ? (
            <button type="button" onClick={onEdit} className="text-[13px] text-muted underline-offset-2 hover:text-signal hover:underline">
              Edit
            </button>
          ) : editHref ? (
            <Link href={editHref} className="text-[13px] text-muted underline-offset-2 hover:text-signal hover:underline">
              Edit
            </Link>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="truncate font-display text-xl text-text">{name}</p>
          <p className="text-sm text-muted">Level {level}</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4">
        <Stat icon={<PixelIcon name="star" size={30} />} value={<Odometer value={totalXp} />} label="Total XP" />
        <Stat icon={<PixelIcon name="rank" size={30} />} value={rank} label="Rank" />
        <Stat icon={<PixelIcon name="gem" size={30} />} value={<Odometer value={badges} />} label="Badges" />
        <Stat icon={<StreakFlame days={streak} active={streakActive} showCount={false} size={30} />} value={<Odometer value={streak} />} label="Day streak" />
      </div>

      <Button href={profileHref} variant="secondary" block className="mt-5">
        View profile
      </Button>
    </section>
  );
}
