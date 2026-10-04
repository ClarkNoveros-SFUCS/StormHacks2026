"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Chip, ModeTile, PixelBurst, PixelIcon, celebrate, useToast } from "@/components/ui";
import type { TopicPracticeGame, TopicReadResponse } from "@/lib/courses/types";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import s from "../explore.module.css";
import { bestLabel, passLabel } from "../_lib/modes";
import { useSignInPrompt } from "./SignInCta";

type PracticeProps = {
  games: TopicPracticeGame[];
  signedIn: boolean;
  locked: boolean;
  topicNumber: number;
  next: { slug: string; title: string } | null;
  courseSlug: string;
  passed: boolean;
};

/**
 * The Practice panel: a ModeTile per practice Game with its pass bar, your best and a passed tick.
 * Play starts a Run (POST /api/games/[gameId]/runs) and opens the Run screen. Signed out, Play
 * opens sign-in; on a locked Topic, Play is disabled ("Pass Topic N−1 first").
 */
export function PracticePanel({ games, signedIn, locked, topicNumber, next, courseSlug, passed }: PracticeProps) {
  const router = useRouter();
  const toast = useToast();
  const signIn = useSignInPrompt();
  const [starting, setStarting] = useState<string | null>(null);

  const play = async (g: TopicPracticeGame) => {
    if (!signedIn) return signIn();
    if (locked || starting) return;
    setStarting(g.gameId);
    try {
      const res = await fetch(`/api/games/${g.gameId}/runs`, { method: "POST" });
      if (res.status === 401) return signIn();
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (res.status === 403) {
        toast({ title: `Pass Topic ${topicNumber - 1} first`, body: body.error, tone: "danger", icon: "lock" });
        return;
      }
      if (!res.ok || !body.runId) throw new Error(body.error ?? `HTTP ${res.status}`);
      sfx.whoosh();
      router.push(`/runs/${body.runId}`);
    } catch (e) {
      toast({ title: "Couldn't start the game", body: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setStarting(null);
    }
  };

  return (
    <section id="practice" aria-labelledby="practice-title" className="card relative scroll-mt-24 overflow-hidden p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="practice-title" className="font-display text-2xl text-text">
          Practice
        </h2>
        {passed && (
          <Chip tone="reward" icon={<PixelIcon name="check" size={12} />}>
            Topic passed
          </Chip>
        )}
      </div>
      <p className="mb-4 text-sm text-muted">
        {locked
          ? `Pass Topic ${topicNumber - 1} first. You can still read this Topic.`
          : next
            ? `Pass any one game to unlock Topic ${topicNumber + 1}: ${next.title}.`
            : "Pass any one game to finish the course."}
      </p>

      {!signedIn && (
        <div className="mb-4 flex flex-col gap-2 rounded-md border border-dashed border-border-strong bg-bg-2/60 p-3 text-sm text-muted">
          Sign in to play, save your best and unlock Topics.
          <Button variant="primary" size="sm" onClick={() => signIn()}>
            Sign in to play
          </Button>
        </div>
      )}

      <ul className={`grid grid-cols-2 gap-3 sm:gap-4 ${locked ? "opacity-60" : ""}`} aria-label="Practice games">
        {games.map((g) => {
          const m = MODE_UI[g.mode as ModeUiId];
          const me = g.me;
          return (
            <li key={g.gameId} className="flex flex-col gap-2">
              <ModeTile mode={g.mode as ModeUiId} onSelect={() => play(g)} locked={false} className={locked ? "pointer-events-none" : ""} />
              <div className="flex flex-col gap-1 px-0.5 text-[13px]">
                <span className="flex items-center gap-1.5 text-text" title={g.passBar}>
                  <PixelIcon name="target" size={13} />
                  {passLabel(g.mode)}
                </span>
                {me && (
                  <span className="flex items-center gap-1.5 text-muted tabular-nums">
                    Best {bestLabel(g.mode, me.best)}
                    {me.passed && (
                      <span className="inline-flex items-center gap-1 text-success">
                        <PixelIcon name="check" size={13} /> passed
                      </span>
                    )}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                variant={me?.passed ? "secondary" : "primary"}
                block
                disabled={locked || starting !== null}
                onClick={() => play(g)}
                aria-label={`${locked ? `Locked: pass Topic ${topicNumber - 1} first` : `Play ${m?.name ?? g.mode}`}: ${g.title}`}
              >
                {locked ? "Locked" : starting === g.gameId ? "Starting…" : signedIn ? (me?.runs ? "Play again" : "Play") : "Sign in to play"}
              </Button>
            </li>
          );
        })}
      </ul>

      {locked && (
        <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center">
          <span className="flex items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3 py-2 font-display text-sm text-text shadow-xl">
            <PixelIcon name="lock" size={18} /> Pass Topic {topicNumber - 1} first
          </span>
        </div>
      )}

      {passed && next && (
        <Button href={`/explore/${courseSlug}/${next.slug}`} variant="primary" block className="mt-5" iconRight={<span>→</span>}>
          Next topic: {next.title}
        </Button>
      )}
    </section>
  );
}

type ReadProps = { courseSlug: string; topicSlug: string; read: boolean; signedIn: boolean };

/** Optional "Mark as read" (Q27): +20 XP the first time, gates nothing. */
export function MarkAsRead({ courseSlug, topicSlug, read: initial, signedIn }: ReadProps) {
  const [read, setRead] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [fire, setFire] = useState(0);
  const toast = useToast();
  const signIn = useSignInPrompt();
  const router = useRouter();

  const mark = async () => {
    if (!signedIn) return signIn();
    if (read || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/courses/${courseSlug}/topics/${topicSlug}/read`, { method: "POST" });
      if (res.status === 401) return signIn();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as TopicReadResponse;
      setRead(true);
      setFire((n) => n + 1);
      if (body.xp.xpAwarded > 0) {
        toast({ title: `+${body.xp.xpAwarded} XP`, body: "Topic marked as read.", tone: "reward", icon: "star" });
      } else {
        toast({ title: "Marked as read", tone: "success" });
      }
      if (body.xp.leveledUp) {
        celebrate();
        toast({ title: `Level ${body.xp.levelAfter}!`, body: "You levelled up.", tone: "reward", icon: "crown", ms: 5000 });
      }
      router.refresh();
    } catch (e) {
      toast({ title: "Couldn't mark as read", body: e instanceof Error ? e.message : undefined, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center">
      <PixelBurst fire={fire} options={{ count: 28, colors: ["#ffd84d", "#9d7bff", "#fff"] }}>
        <span className="grid h-12 w-12 place-items-center rounded-md bg-bg-2 ring-1 ring-border">
          <PixelIcon name={read ? "check" : "book"} size={26} />
        </span>
      </PixelBurst>
      <div className="flex-1">
        <p className="font-display text-lg text-text">{read ? "You've read this Topic" : "Finished reading?"}</p>
        <p className="text-sm text-muted">
          {read ? "Nice. Now lock it in with a practice game." : "Mark it as read for +20 XP. Optional: practice is open either way."}
        </p>
      </div>
      <Button variant={read ? "ghost" : "primary"} onClick={mark} disabled={read || busy} icon={<PixelIcon name={read ? "check" : "star"} size={14} />}>
        {read ? "Read" : busy ? "Saving…" : signedIn ? "Mark as read · +20 XP" : "Sign in to mark as read"}
      </Button>
    </div>
  );
}

type PassedProps = { topicSlug: string; topicNumber: number; badgeId: string; badgeName: string; next: { slug: string; title: string } | null; courseSlug: string };

/** "Topic passed!" banner. Confetti the first time it's seen this session. */
export function TopicPassedBanner({ topicSlug, topicNumber, badgeName, next, courseSlug }: PassedProps) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    const key = `explore:passed:${courseSlug}:${topicSlug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked: celebrate anyway */
    }
    const t = setTimeout(() => celebrate(), 350);
    return () => clearTimeout(t);
  }, [courseSlug, topicSlug]);

  return (
    <div className={`${s.passBanner} flex flex-col items-start gap-4 rounded-lg border border-primary/50 p-5 sm:flex-row sm:items-center`} role="status">
      <Badge name={badgeName} icon="star" tone="bronze" earned size={60} />
      <div className="flex-1">
        <p className="font-display text-2xl text-primary">Topic passed!</p>
        <p className="text-sm text-text/85">
          You earned the Topic {topicNumber} badge and +150 XP.
          {next ? ` Topic ${topicNumber + 1} is unlocked.` : " That was the last Topic."}
        </p>
      </div>
      {next ? (
        <Button href={`/explore/${courseSlug}/${next.slug}`} variant="primary" iconRight={<span>→</span>}>
          Next topic
        </Button>
      ) : (
        <Button href={`/explore/${courseSlug}`} variant="primary">
          Back to course
        </Button>
      )}
    </div>
  );
}

/** Small mobile helper: jump from the header to the Practice panel. */
export function JumpToPractice() {
  return (
    <Link href="#practice" className="inline-flex items-center gap-1.5 text-sm text-signal hover:underline lg:hidden">
      <PixelIcon name="target" size={14} /> Jump to practice ↓
    </Link>
  );
}
