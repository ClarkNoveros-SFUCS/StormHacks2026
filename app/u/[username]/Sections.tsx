// Profile main-column sections (server components): Bests, Course progress, Recent activity.
// Only public content: public Game titles, Course names, counts. Never a Module or its Games.
import Link from "next/link";
import { Chip, ModeBadge, PixelIcon, ProgressBar, Tooltip, type PixelIconName } from "@/components/ui";
import { Medallion } from "@/components/social/BadgeGrid";
import { EmptyState } from "@/components/social/EmptyState";
import { badgeInfo } from "@/lib/social/badges";
import type { GameBest } from "@/lib/social/types";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import type { ActivityItem, CourseProgressRow } from "./data";

export function SectionCard({ title, icon, action, children, id }: { title: string; icon: PixelIconName; action?: React.ReactNode; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="card bg-surface/95 p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-lg text-text">
          <PixelIcon name={icon} size={18} /> {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const isMode = (m: string): m is ModeUiId => m in MODE_UI;

/** Best score per Mode on public Games (Daily Dive, Course practice), then the rest of the list. */
export function Bests({ bests, isMe }: { bests: GameBest[]; isMe: boolean }) {
  if (bests.length === 0) {
    return (
      <EmptyState say={isMe ? "Play a Course practice Game or the Daily Dive to set a best!" : "No public bests yet. Maybe they're studying in secret."} title="No bests yet">
        {isMe && (
          <Link href="/explore" className="font-display text-sm text-signal hover:underline">
            Explore courses →
          </Link>
        )}
      </EmptyState>
    );
  }
  const perMode = new Map<string, GameBest>();
  for (const b of bests) {
    const cur = perMode.get(b.mode);
    if (!cur || b.best > cur.best) perMode.set(b.mode, b);
  }
  const top = [...perMode.values()].sort((a, b) => b.best - a.best);
  const rest = bests.filter((b) => !top.includes(b)).slice(0, 6);
  return (
    <div>
      <ul className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3">
        {top.map((b, i) => {
          const m = isMode(b.mode) ? MODE_UI[b.mode] : MODE_UI.dive;
          return (
            <li
              key={b.gameId}
              className="card group relative overflow-hidden bg-bg-2 p-3 transition hover:-translate-y-0.5"
              style={{ "--i": i, borderColor: `color-mix(in srgb, ${m.accent} 40%, transparent)` } as React.CSSProperties}
            >
              <span aria-hidden="true" className="absolute -top-6 -right-6 h-16 w-16 rounded-full opacity-20 blur-xl transition group-hover:opacity-40" style={{ background: m.accent }} />
              {isMode(b.mode) && <ModeBadge mode={b.mode} />}
              <p className="mt-2 font-hud text-3xl leading-none" style={{ color: m.accent }}>
                {b.best.toLocaleString("en-US")}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-muted" title={b.title}>
                {b.title}
              </p>
            </li>
          );
        })}
      </ul>
      {rest.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60 text-sm">
          {rest.map((b) => (
            <li key={b.gameId} className="flex items-center gap-3 py-2">
              {isMode(b.mode) && <ModeBadge mode={b.mode} />}
              <span className="min-w-0 flex-1 truncate text-text">{b.title}</span>
              <span className="font-hud text-lg text-reward">{b.best.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Courses({ courses, earnedBadges }: { courses: CourseProgressRow[]; earnedBadges: Set<string> }) {
  return (
    <ul className="flex flex-col gap-4">
      {courses.map((c) => {
        const grad = badgeInfo(c.badgeId);
        return (
          <li key={c.slug} className="rounded-md border border-border bg-bg-2 p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <Link href={`/explore/${c.slug}`} className="font-display text-text hover:text-signal">
                {c.title}
              </Link>
              {c.finished ? <Chip tone="reward">Graduated</Chip> : <span className="text-xs text-muted">{c.passed} / {c.total} Topics</span>}
            </div>
            <ProgressBar value={c.passed} max={Math.max(1, c.total)} tone="var(--success)" label={`${c.title} progress`} />
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Topic badges">
              {c.topics.map((t) => {
                const badge = badgeInfo(t.badgeId);
                if (!badge) return null;
                const earned = t.passed || earnedBadges.has(t.badgeId);
                return (
                  <li key={t.slug}>
                    <Tooltip label={`Topic ${t.number}: ${t.title}${earned ? " · passed" : " · not passed yet"}`}>
                      <Link href={`/explore/${c.slug}/${t.slug}`} className="block rounded-md transition hover:-translate-y-0.5" aria-label={`Topic ${t.number}: ${t.title}${earned ? ", passed" : ""}`}>
                        <Medallion badge={badge} earned={earned} size={38} />
                      </Link>
                    </Tooltip>
                  </li>
                );
              })}
              {grad && (
                <li>
                  <Tooltip label={c.finished ? grad.name : `${grad.name}: ${grad.description}`}>
                    <span tabIndex={0} className="block rounded-md" aria-label={`${grad.name}${c.finished ? ", earned" : ", locked"}`}>
                      <Medallion badge={grad} earned={c.finished} size={38} />
                    </span>
                  </Tooltip>
                </li>
              )}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

const KIND_ICON: Record<ActivityItem["kind"], PixelIconName> = {
  run: "target",
  topic_passed: "check",
  topic_read: "book",
  course_finished: "crown",
  daily: "bolt",
  other: "star",
};

export function RecentActivity({ items, isMe }: { items: ActivityItem[]; isMe: boolean }) {
  if (items.length === 0) {
    return <EmptyState say={isMe ? "Your log is empty. Let's make some waves!" : "All quiet down here."} title="No activity yet" />;
  }
  return (
    <ol className="relative flex flex-col gap-1 before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-border">
      {items.map((it, i) => {
        const mode = it.mode && isMode(it.mode) ? MODE_UI[it.mode] : null;
        const body = (
          <>
            <span className="relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border-strong bg-surface-2">
              <PixelIcon name={KIND_ICON[it.kind]} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-text">{it.text}</span>
              <span className="block text-xs text-muted">
                {it.ago}
                {it.score !== null && mode && (
                  <>
                    {" · "}
                    <span style={{ color: mode.accent }}>{it.score.toLocaleString("en-US")} pts</span>
                  </>
                )}
              </span>
            </span>
            <span className="shrink-0 font-display text-sm text-reward">+{it.xp} XP</span>
          </>
        );
        return (
          <li key={`${it.at}-${i}`} className="animate-rise-in" style={{ animationDelay: `${i * 50}ms` }}>
            {it.href ? (
              <Link href={it.href} className="flex items-center gap-3 rounded-md px-0 py-1.5 transition hover:bg-surface-2/60">
                {body}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
