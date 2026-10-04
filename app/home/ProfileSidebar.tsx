"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AvatarPicker, Button, Modal, PixelAvatar, ProfileCard, XpBar, useToast } from "@/components/ui";
import { profileHref } from "@/components/site/nav-types";
import { celebrate } from "@/components/ui/Confetti";
import type { ProfileCard as ProfileCardData } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";

type Props = { card: ProfileCardData; usePhoto: boolean; clerkImageUrl: string | null };

/**
 * The Codedex-style profile card (decision Q12) with Edit → avatar picker (pixel avatar or the
 * Clerk photo, Q17), saved with PATCH /api/me/profile; plus the XP bar to the next Level.
 */
export function ProfileSidebar({ card, usePhoto: initialUsePhoto, clerkImageUrl }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [avatar, setAvatar] = useState(card.player.avatar);
  const [usePhoto, setUsePhoto] = useState(initialUsePhoto);
  const [draft, setDraft] = useState({ avatar: card.player.avatar, usePhoto: initialUsePhoto });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const lv = card.level;

  const openEditor = () => {
    setDraft({ avatar, usePhoto });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar: draft.avatar, usePhoto: draft.usePhoto }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Couldn't save your avatar");
      }
      setAvatar(draft.avatar);
      setUsePhoto(draft.usePhoto);
      setOpen(false);
      sfx.reward();
      toast({ title: "Looking good!", body: "Your new avatar is saved.", tone: "success" });
      router.refresh();
    } catch (e) {
      sfx.error();
      toast({ title: "Not saved", body: (e as Error).message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ProfileCard
        name={card.player.displayName}
        level={lv.level}
        avatarId={avatar}
        imageUrl={usePhoto ? clerkImageUrl : null}
        totalXp={card.totalXp}
        rank={lv.rank}
        badges={card.badgeCount}
        streak={card.streak.current}
        streakActive={card.streak.playedToday}
        onEdit={openEditor}
        profileHref={profileHref(card.player)}
      />
      <div className="card bg-surface/95 p-4">
        <button type="button" className="block w-full text-left" onClick={() => celebrate()} title="Celebrate!" aria-label={`Level ${lv.level}: ${lv.xpIntoLevel} of ${lv.xpForNext} XP. Click to celebrate.`}>
          <XpBar xp={card.totalXp} levelStartXp={lv.levelStartXp} nextLevelXp={lv.nextLevelXp} level={lv.level} />
        </button>
        <p className="mt-2 text-xs text-muted">
          {(lv.nextLevelXp - card.totalXp).toLocaleString("en-US")} XP to Level {lv.level + 1}
        </p>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose your avatar"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </>
        }
      >
        <div className="mb-4 flex items-center gap-4">
          <PixelAvatar id={draft.avatar} imageUrl={draft.usePhoto ? clerkImageUrl : null} size={72} />
          <p className="text-sm text-muted">Pick a pixel buddy. It shows on your profile, the leaderboards and your friends&apos; lists.</p>
        </div>
        <div className={draft.usePhoto ? "pointer-events-none opacity-40" : undefined} aria-disabled={draft.usePhoto}>
          <AvatarPicker value={draft.avatar} onChange={(id) => setDraft((d) => ({ ...d, avatar: id, usePhoto: false }))} />
        </div>
        {clerkImageUrl && (
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-md border border-border bg-bg-2 p-3">
            <input
              type="checkbox"
              checked={draft.usePhoto}
              onChange={(e) => {
                sfx.toggle();
                setDraft((d) => ({ ...d, usePhoto: e.target.checked }));
              }}
              className="h-5 w-5 accent-[var(--primary)]"
            />
            <PixelAvatar id={draft.avatar} imageUrl={clerkImageUrl} size={36} bob={false} />
            <span className="text-sm text-text">Use my account photo instead</span>
          </label>
        )}
      </Modal>
    </>
  );
}
