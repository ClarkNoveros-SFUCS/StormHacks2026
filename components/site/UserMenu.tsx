"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { PixelIcon } from "@/components/ui";
import { sfx } from "@/lib/ui/sfx";
import { profileHref, type NavPlayer } from "./nav-types";
import { PlayerAvatar } from "./PlayerAvatar";

/** Signs out through Clerk and lands on the landing page. */
export function SignOutAction({ className = "", role }: { className?: string; role?: string }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      role={role}
      className={className}
      onClick={() => {
        sfx.click();
        void signOut({ redirectUrl: "/" });
      }}
    >
      Sign out
    </button>
  );
}

const ITEM =
  "flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-left font-display text-[15px] text-muted outline-none transition hover:bg-surface hover:text-text focus-visible:bg-surface focus-visible:text-text";

/** The avatar button and its menu: Profile, Friends, Sign out. Arrow keys move, Escape closes. */
export function UserMenu({ player }: { player: NavPlayer | null }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    requestAnimationFrame(() => items()[0]?.focus());
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        list[(i + 1) % list.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        list[(i - 1 + list.length) % list.length]?.focus();
      } else if (e.key === "Tab") {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = player?.displayName ?? "You";
  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Account menu for ${name}`}
        onMouseEnter={() => sfx.hover()}
        onClick={() => {
          sfx.click();
          setOpen((o) => !o);
        }}
        className={`grid h-10 w-10 place-items-center rounded-md ring-2 transition ${open ? "ring-primary" : "ring-border hover:ring-signal"}`}
      >
        {player ? <PlayerAvatar player={player} size={36} /> : <PixelIcon name="users" size={20} />}
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute top-full right-0 z-50 mt-2 w-60 rounded-md border border-border-strong bg-surface-2 p-2 shadow-2xl"
          style={{ animation: "pop-in .25s var(--ease-snap) both", transformOrigin: "top right" }}
        >
          {player && (
            <div className="mb-1 border-b border-border px-3 pt-1 pb-3">
              <p className="truncate font-display text-text">{player.displayName}</p>
              {player.username && <p className="truncate text-sm text-muted">@{player.username}</p>}
              <p className="mt-1 text-xs text-faint">
                Level {player.level} · {player.rank}
              </p>
            </div>
          )}
          <Link role="menuitem" href={profileHref(player)} className={ITEM} onClick={() => setOpen(false)}>
            <PixelIcon name="eye" size={16} /> Profile
          </Link>
          <Link role="menuitem" href="/friends" className={ITEM} onClick={() => setOpen(false)}>
            <PixelIcon name="users" size={16} /> Friends
          </Link>
          <Link role="menuitem" href="/modules" className={ITEM} onClick={() => setOpen(false)}>
            <PixelIcon name="book" size={16} /> My Modules
          </Link>
          <div className="my-1 border-t border-border" />
          <SignOutAction role="menuitem" className={`${ITEM} hover:text-danger focus-visible:text-danger`} />
        </div>
      )}
    </div>
  );
}
