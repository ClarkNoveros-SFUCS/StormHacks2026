"use client";
import Link from "next/link";
import { useState } from "react";
import { Button, Chip, PixelAvatar, PixelIcon } from "@/components/ui";
import { FriendButton } from "@/components/social/FriendButton";
import { ProfileBanner } from "@/components/social/ProfileBanner";
import { RankEmblem } from "@/components/social/RankEmblem";
import type { BannerId } from "@/components/social/banners";
import { joinedText, plural } from "@/components/social/format";
import type { FriendStatus, PlayerSummary } from "@/lib/social/types";
import { EditProfile, type EditableProfile } from "./EditProfile";

type Props = {
  player: PlayerSummary & { username: string };
  banner: BannerId;
  bio: string | null;
  joinedAt: string;
  counts: { friends: number; runsFinished: number; topicsPassed: number; modules: number };
  friendStatus: FriendStatus;
  friendRequestId: string | null;
  /** Present only on your own profile. */
  editable: EditableProfile | null;
};

/**
 * Codedex-style profile header: wide animated pixel banner, a round avatar overlapping it with a
 * bob, name, @username, joined date, counts and the action (Edit profile or the friend button).
 */
export function ProfileHeader({ player, banner, bio, joinedAt, counts, friendStatus, friendRequestId, editable }: Props) {
  const [editing, setEditing] = useState(false);
  const [friends, setFriends] = useState(counts.friends);
  const [status, setStatus] = useState(friendStatus);
  const isMe = editable !== null;

  return (
    <section aria-label={`${player.displayName}'s profile`} className="card overflow-hidden bg-surface/95">
      <div className="relative h-32 sm:h-48">
        <ProfileBanner theme={banner} />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-[#141a33]/80" />
        {isMe && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="absolute top-3 right-3 rounded-sm border border-white/30 bg-black/40 px-2.5 py-1 font-display text-xs text-white backdrop-blur-sm transition hover:bg-black/60"
          >
            Change banner
          </button>
        )}
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-5">
          <div className="-mt-14 w-fit animate-bob sm:-mt-16">
            <div className="overflow-hidden rounded-full border-4 border-surface bg-surface shadow-[0_8px_24px_-6px_rgba(0,0,0,.6)] ring-2 ring-primary/70">
              <PixelAvatar id={player.avatar} imageUrl={player.imageUrl} size={112} alt={`${player.displayName}'s avatar`} />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl text-text sm:text-3xl">{player.displayName}</h1>
              <Chip tone="reward" icon={<PixelIcon name="star" size={12} />}>
                Lv {player.level}
              </Chip>
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <RankEmblem rank={player.rank} size={18} />
                {player.rank}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              <span className="text-signal">@{player.username}</span> · {joinedText(joinedAt)}
            </p>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              {isMe ? (
                <Link href="/friends" className="hover:text-text">
                  <span className="font-display text-text">{friends}</span> {friends === 1 ? "friend" : "friends"}
                </Link>
              ) : (
                <span>
                  <span className="font-display text-text">{friends}</span> {friends === 1 ? "friend" : "friends"}
                </span>
              )}
              <span>
                <span className="font-display text-text">{counts.runsFinished.toLocaleString("en-US")}</span> {counts.runsFinished === 1 ? "run" : "runs"}
              </span>
              <span>
                <span className="font-display text-text">{counts.topicsPassed}</span> {counts.topicsPassed === 1 ? "topic passed" : "topics passed"}
              </span>
              <span title="Modules are private: only the count is shown">{plural(counts.modules, "private module")}</span>
            </p>
          </div>

          <div className="shrink-0">
            {isMe ? (
              <Button variant="secondary" onClick={() => setEditing(true)} icon={<PixelIcon name="gear" size={16} />}>
                Edit profile
              </Button>
            ) : (
              <FriendButton
                username={player.username}
                displayName={player.displayName}
                status={friendStatus}
                requestId={friendRequestId}
                onChange={(next) => {
                  if (next === "friends" && status !== "friends") setFriends((n) => n + 1);
                  if (next !== "friends" && status === "friends") setFriends((n) => Math.max(0, n - 1));
                  setStatus(next);
                }}
              />
            )}
          </div>
        </div>

        {bio ? (
          <p className="mt-4 max-w-2xl text-[15px] text-text">{bio}</p>
        ) : isMe ? (
          <button type="button" onClick={() => setEditing(true)} className="mt-4 text-sm text-faint italic hover:text-muted">
            Add a bio so friends know what you&apos;re studying…
          </button>
        ) : null}
      </div>

      {editable && <EditProfile open={editing} onClose={() => setEditing(false)} profile={editable} />}
    </section>
  );
}
