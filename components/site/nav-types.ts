// What the site nav shows about the signed-in Player. Client-safe.
import type { ProfileCard } from "@/lib/social/types";

export type NavPlayer = {
  username: string | null;
  displayName: string;
  avatar: string;
  /** The Clerk photo, only when the Player chose it (use_photo). */
  imageUrl: string | null;
  level: number;
  rank: string;
  totalXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  streak: number;
  playedToday: boolean;
};

/** Signed out, or signed in (player is null when the Profile couldn't be loaded). */
export type NavState = { signedIn: false } | { signedIn: true; player: NavPlayer | null };

export function navPlayerFrom(card: ProfileCard): NavPlayer {
  return {
    username: card.player.username,
    displayName: card.player.displayName,
    avatar: card.player.avatar,
    imageUrl: card.player.imageUrl,
    level: card.level.level,
    rank: card.level.rank,
    totalXp: card.totalXp,
    levelStartXp: card.level.levelStartXp,
    nextLevelXp: card.level.nextLevelXp,
    streak: card.streak.current,
    playedToday: card.streak.playedToday,
  };
}

/** Where "Profile" goes: the public profile, or /profile (F26 redirects it) before a username exists. */
export function profileHref(p: Pick<NavPlayer, "username"> | null): string {
  return p?.username ? `/u/${p.username}` : "/profile";
}

/** Mode screens are full-bleed: no nav or footer over a Run, a Reveal or the Dive playground. */
export const FULL_BLEED = [/^\/runs\//, /^\/styleguide\/dive/];
export const isFullBleed = (pathname: string) => FULL_BLEED.some((re) => re.test(pathname));
