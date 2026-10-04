"use client";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { AvatarPicker, Button, Modal, PixelAvatar, useToast } from "@/components/ui";
import { ApiError, socialApi } from "@/components/social/api";
import { BANNERS, type BannerId } from "@/components/social/banners";
import { ProfileBanner } from "@/components/social/ProfileBanner";
import { celebrate } from "@/components/ui/Confetti";
import { normalizeUsername, usernameProblem } from "@/lib/social/username";
import type { AvatarId, ProfilePatch } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";

export type EditableProfile = {
  username: string;
  displayName: string;
  bio: string | null;
  avatar: string;
  usePhoto: boolean;
  clerkImageUrl: string | null;
  banner: BannerId;
};

type Availability = { state: "idle" | "same" | "checking" | "ok" | "taken" | "invalid"; message: string };

const BIO_MAX = 160;

/** Debounced username check: format and reserved words locally, then an exact match in player search. */
function useAvailability(input: string, current: string): Availability {
  const name = normalizeUsername(input);
  const problem = name === current ? null : usernameProblem(name);
  const local: Availability | null =
    name === current
      ? { state: "same", message: "That's your current username." }
      : problem === "format"
        ? { state: "invalid", message: "3–20 lowercase letters, digits or underscores." }
        : problem === "reserved"
          ? { state: "taken", message: "That username is reserved." }
          : null;
  const [remote, setRemote] = useState<{ name: string; taken: boolean } | null>(null);

  const needsRemote = local === null;
  useEffect(() => {
    if (!needsRemote) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { players } = await socialApi.search(name, 50, ctrl.signal);
        setRemote({ name, taken: players.some((p) => p.player.username === name) });
      } catch {
        /* aborted or offline: the server still checks on save */
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [name, needsRemote]);

  if (local) return local;
  if (!remote || remote.name !== name) return { state: "checking", message: "Checking…" };
  return remote.taken ? { state: "taken", message: `@${name} is taken.` } : { state: "ok", message: `@${name} is available!` };
}

export function EditProfile({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: EditableProfile }) {
  return open ? <EditProfileDialog onClose={onClose} profile={profile} /> : null;
}

function EditProfileDialog({ onClose, profile }: { onClose: () => void; profile: EditableProfile }) {
  const router = useRouter();
  const toast = useToast();
  const ids = { name: useId(), user: useId(), bio: useId(), userHelp: useId() };
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio ?? "");
  const [avatar, setAvatar] = useState(profile.avatar);
  const [usePhoto, setUsePhoto] = useState(profile.usePhoto);
  const [banner, setBanner] = useState<BannerId>(profile.banner);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const avail = useAvailability(username, profile.username);

  const nameOk = displayName.trim().length >= 1 && displayName.trim().length <= 40;
  const canSave = nameOk && (avail.state === "same" || avail.state === "ok") && bio.length <= BIO_MAX && !saving;

  const save = async () => {
    const patch: ProfilePatch = {};
    const newUsername = normalizeUsername(username);
    if (newUsername !== profile.username) patch.username = newUsername;
    if (displayName.trim() !== profile.displayName) patch.displayName = displayName.trim();
    if (bio.trim() !== (profile.bio ?? "")) patch.bio = bio.trim() || null;
    if (avatar !== profile.avatar) patch.avatar = avatar as AvatarId;
    if (usePhoto !== profile.usePhoto) patch.usePhoto = usePhoto;
    if (banner !== profile.banner) patch.banner = banner;
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await socialApi.updateProfile(patch);
      sfx.reward();
      toast({ title: "Profile saved", body: "Looking sharp!", tone: "success" });
      if (patch.banner) celebrate();
      onClose();
      if (patch.username) router.replace(`/u/${patch.username}`);
      router.refresh();
    } catch (e) {
      sfx.error();
      setError(e instanceof ApiError && e.status === 409 ? "That username was just taken. Try another." : (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const availTone =
    avail.state === "ok" ? "text-success" : avail.state === "taken" || avail.state === "invalid" ? "text-danger" : "text-muted";

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit profile"
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor={ids.name} className="flex flex-col gap-1.5">
            <span className="font-display text-sm text-text">Display name</span>
            <input
              id={ids.name}
              value={displayName}
              maxLength={40}
              onChange={(e) => setDisplayName(e.target.value)}
              className="h-11 rounded-md border border-border bg-bg-2 px-3 text-text outline-none focus:border-signal"
            />
          </label>
          <label htmlFor={ids.user} className="flex flex-col gap-1.5">
            <span className="font-display text-sm text-text">Username</span>
            <span className="flex h-11 items-center rounded-md border border-border bg-bg-2 focus-within:border-signal">
              <span className="pl-3 text-muted" aria-hidden="true">
                @
              </span>
              <input
                id={ids.user}
                value={username}
                maxLength={21}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={ids.userHelp}
                aria-invalid={avail.state === "taken" || avail.state === "invalid"}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                className="h-full min-w-0 flex-1 bg-transparent pr-3 pl-1 text-text outline-none"
              />
            </span>
            <span id={ids.userHelp} aria-live="polite" className={`text-xs ${availTone}`}>
              {avail.state === "ok" ? "✓ " : avail.state === "taken" || avail.state === "invalid" ? "✕ " : ""}
              {avail.message}
            </span>
          </label>
        </div>

        <label htmlFor={ids.bio} className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between font-display text-sm text-text">
            Bio
            <span className={`font-sans text-xs ${bio.length > BIO_MAX ? "text-danger" : "text-faint"}`}>
              {bio.length}/{BIO_MAX}
            </span>
          </span>
          <textarea
            id={ids.bio}
            value={bio}
            rows={2}
            maxLength={BIO_MAX}
            placeholder="What are you studying? What's your favourite Mode?"
            onChange={(e) => setBio(e.target.value)}
            className="resize-none rounded-md border border-border bg-bg-2 px-3 py-2 text-text outline-none placeholder:text-faint focus:border-signal"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 font-display text-sm text-text">Banner</legend>
          <div role="radiogroup" aria-label="Banner theme" className="grid grid-cols-3 gap-2">
            {BANNERS.map((b) => {
              const on = b.id === banner;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={b.blurb}
                  onClick={() => {
                    sfx.pop();
                    setBanner(b.id);
                  }}
                  className={`overflow-hidden rounded-md text-left transition ${on ? "ring-2 ring-primary" : "ring-1 ring-border hover:ring-signal"}`}
                >
                  <span className="block h-12 sm:h-14">
                    <ProfileBanner theme={b.id} />
                  </span>
                  <span className="block bg-bg-2 px-2 py-1 font-display text-xs text-text">{b.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-display text-sm text-text">Avatar</legend>
          <div className="mb-3 flex items-center gap-4">
            <PixelAvatar id={avatar} imageUrl={usePhoto ? profile.clerkImageUrl : null} size={64} />
            <p className="text-sm text-muted">Your pixel buddy shows on your profile, the leaderboards and your friends&apos; lists.</p>
          </div>
          <div className={usePhoto ? "pointer-events-none opacity-40" : undefined} aria-disabled={usePhoto}>
            <AvatarPicker
              value={avatar}
              onChange={(id) => {
                setAvatar(id);
                setUsePhoto(false);
              }}
            />
          </div>
          {profile.clerkImageUrl && (
            <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-md border border-border bg-bg-2 p-3">
              <input
                type="checkbox"
                checked={usePhoto}
                onChange={(e) => {
                  sfx.toggle();
                  setUsePhoto(e.target.checked);
                }}
                className="h-5 w-5 accent-[var(--primary)]"
              />
              <PixelAvatar id={avatar} imageUrl={profile.clerkImageUrl} size={36} bob={false} />
              <span className="text-sm text-text">Use my account photo instead</span>
            </label>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="rounded-md border border-danger/60 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
