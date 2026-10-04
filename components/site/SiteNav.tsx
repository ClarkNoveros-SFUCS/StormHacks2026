"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Button, Drawer, Logo, Odometer, PixelIcon, SoundToggle, StreakFlame, XpBar } from "@/components/ui";
import type { ProfileCard } from "@/lib/social/types";
import { sfx } from "@/lib/ui/sfx";
import { isFullBleed, navPlayerFrom, profileHref, type NavPlayer, type NavState } from "./nav-types";
import { SignOutAction, UserMenu } from "./UserMenu";
import { PlayerAvatar } from "./PlayerAvatar";

type NavLink = { href: string; label: string; signedInOnly?: boolean };

const LINKS: NavLink[] = [
  { href: "/explore", label: "Explore" },
  { href: "/modules", label: "My Modules", signedInOnly: true },
  { href: "/daily", label: "Daily" },
  { href: "/leaderboard", label: "Leaderboard", signedInOnly: true },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`) || (href === "/modules" && pathname.startsWith("/games/"));
}

/**
 * The site header: Logo · Explore · My Modules · Daily · Leaderboard, and on the right the
 * streak flame, the level chip (XP bar on hover/focus), the mute tile and the avatar menu.
 * Signed out: Explore, Daily, Sign in and the yellow "Start playing". Below `md` the links
 * move into a bottom menu sheet. Hidden on Mode screens. Spec: design-system §2.6.
 */
export function SiteNav({ initial }: { initial: NavState }) {
  const pathname = usePathname();
  const [state, setState] = useState<NavState>(initial);
  const [sheet, setSheet] = useState(false);
  const first = useRef(true);

  // The root layout doesn't re-render on client navigation: refresh XP/streak on route change
  // (e.g. coming back from a Run's Reveal).
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!state.signedIn) return;
    let live = true;
    fetch("/api/me/summary")
      .then((r) => (r.ok ? (r.json() as Promise<ProfileCard>) : null))
      .then((card) => {
        if (live && card) setState({ signedIn: true, player: navPlayerFrom(card) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [pathname, state.signedIn]);

  if (isFullBleed(pathname)) return null;
  const signedIn = state.signedIn;
  const player = state.signedIn ? state.player : null;
  const links = LINKS.filter((l) => signedIn || !l.signedInOnly);

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-bg/80 backdrop-blur-md">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Logo size="sm" href={signedIn ? "/home" : "/"} />

        <ul className="ml-4 hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = isActive(pathname, l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  onMouseEnter={() => sfx.hover()}
                  className={`relative block rounded-sm px-3 py-2 font-display text-[15px] transition-colors after:absolute after:inset-x-3 after:bottom-1 after:h-[2px] after:origin-left after:bg-primary after:transition-transform after:duration-300 after:ease-[var(--ease-snap)] ${
                    active ? "text-text after:scale-x-100" : "text-muted after:scale-x-0 hover:text-text hover:after:scale-x-50"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {signedIn ? (
            <>
              {player && <StreakLink player={player} />}
              {player && <LevelChip player={player} className="hidden sm:inline-flex" />}
              <SoundToggle className="hidden md:grid" />
              <div className="hidden md:block">
                <UserMenu player={player} />
              </div>
            </>
          ) : (
            <>
              <SoundToggle className="hidden md:grid" />
              <SignInButton mode="modal" forceRedirectUrl="/home">
                <button type="button" className="hidden rounded-sm px-3 py-2 font-display text-[15px] text-muted transition hover:text-text md:block">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal" forceRedirectUrl="/home">
                <Button variant="primary" size="sm" className="hidden sm:inline-flex">
                  Start playing
                </Button>
              </SignUpButton>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              sfx.click();
              setSheet(true);
            }}
            aria-label="Open menu"
            aria-expanded={sheet}
            className="grid h-10 w-10 place-items-center rounded-sm border border-border bg-surface transition hover:border-signal md:hidden"
          >
            {player ? <PlayerAvatar player={player} size={30} /> : <PixelIcon name="menu" size={18} />}
          </button>
        </div>
      </nav>

      <Drawer open={sheet} onClose={() => setSheet(false)} side="bottom" title="Menu">
        <MobileSheet links={links} pathname={pathname} state={state} onNavigate={() => setSheet(false)} />
      </Drawer>
    </header>
  );
}

function StreakLink({ player }: { player: NavPlayer }) {
  const label = player.playedToday
    ? `${player.streak}-day streak, played today`
    : player.streak > 0
      ? `${player.streak}-day streak: play today to keep it`
      : "No streak yet: finish a Run to light it";
  return (
    <Link
      href="/daily"
      aria-label={label}
      title={label}
      onMouseEnter={() => sfx.hover()}
      className="flex h-9 items-center rounded-sm px-1.5 transition hover:bg-surface"
    >
      <StreakFlame days={player.streak} active={player.playedToday} size={24} />
    </Link>
  );
}

/** "Lv 4" chip; hovering or focusing it opens a card with the XP bar and Rank. */
function LevelChip({ player, className = "" }: { player: NavPlayer; className?: string }) {
  return (
    <div className={`group relative ${className}`}>
      <Link
        href={profileHref(player)}
        onMouseEnter={() => sfx.hover()}
        aria-label={`Level ${player.level}, ${player.totalXp.toLocaleString()} XP, ${player.rank}`}
        className="flex h-9 items-center gap-1.5 rounded-sm border border-border bg-surface px-2.5 font-display text-sm text-reward transition hover:border-reward"
      >
        <PixelIcon name="star" size={16} />
        <span>Lv {player.level}</span>
      </Link>
      <div
        role="tooltip"
        className="invisible absolute top-full right-0 z-50 mt-2 w-64 translate-y-1 rounded-md border border-border-strong bg-surface-2 p-4 opacity-0 shadow-2xl transition duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
      >
        <XpBar xp={player.totalXp} levelStartXp={player.levelStartXp} nextLevelXp={player.nextLevelXp} level={player.level} />
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted">
            <PixelIcon name="rank" size={16} /> {player.rank}
          </span>
          <span className="font-hud text-xl text-reward">
            <Odometer value={player.totalXp} /> XP
          </span>
        </div>
      </div>
    </div>
  );
}

function MobileSheet({
  links,
  pathname,
  state,
  onNavigate,
}: {
  links: NavLink[];
  pathname: string;
  state: NavState;
  onNavigate: () => void;
}) {
  const player = state.signedIn ? state.player : null;
  return (
    <div className="flex flex-col gap-5">
      {player && (
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} size={52} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg">{player.displayName}</p>
            {player.username && <p className="truncate text-sm text-muted">@{player.username}</p>}
          </div>
          <StreakFlame days={player.streak} active={player.playedToday} size={26} />
        </div>
      )}
      {player && <XpBar xp={player.totalXp} levelStartXp={player.levelStartXp} nextLevelXp={player.nextLevelXp} level={player.level} />}
      <ul className="grid grid-cols-2 gap-2">
        {(state.signedIn ? [{ href: "/home", label: "Home" }, ...links] : links).map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex h-12 items-center rounded-md border px-4 font-display transition ${
                  active ? "border-primary bg-surface-2 text-text" : "border-border bg-bg-2 text-muted hover:text-text"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
        {state.signedIn && (
          <>
            <li>
              <Link href={profileHref(player)} onClick={onNavigate} className="flex h-12 items-center rounded-md border border-border bg-bg-2 px-4 font-display text-muted hover:text-text">
                Profile
              </Link>
            </li>
            <li>
              <Link href="/friends" onClick={onNavigate} className="flex h-12 items-center rounded-md border border-border bg-bg-2 px-4 font-display text-muted hover:text-text">
                Friends
              </Link>
            </li>
          </>
        )}
      </ul>
      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        <span className="flex items-center gap-2 text-sm text-muted">
          <SoundToggle /> Sound
        </span>
        {state.signedIn ? (
          <SignOutAction className="font-display text-sm text-danger hover:underline" />
        ) : (
          <div className="flex gap-2">
            <SignInButton mode="modal" forceRedirectUrl="/home">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </SignInButton>
            <SignUpButton mode="modal" forceRedirectUrl="/home">
              <Button variant="primary" size="sm">
                Start playing
              </Button>
            </SignUpButton>
          </div>
        )}
      </div>
    </div>
  );
}
