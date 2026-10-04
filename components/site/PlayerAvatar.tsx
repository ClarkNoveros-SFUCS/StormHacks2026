"use client";
import { PixelAvatar } from "@/components/ui";

type AvatarSource = { avatar: string; imageUrl: string | null; displayName: string };

/** A Player's pixel avatar, or their Clerk photo when they chose it (use_photo, decision Q17). */
export function PlayerAvatar({ player, size = 32, bob = true }: { player: AvatarSource; size?: number; bob?: boolean }) {
  return <PixelAvatar id={player.avatar} imageUrl={player.imageUrl} size={size} bob={bob} alt={`${player.displayName}'s avatar`} />;
}
