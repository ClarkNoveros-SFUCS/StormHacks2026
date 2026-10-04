"use client";
// Play: unlock audio, POST /api/games/[gameId]/runs, then route to /runs/[runId] (F09 and the
// Mode screens own that page). 403 = a locked Course Topic, 409 = not playable right now.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { sfx } from "@/lib/ui/sfx";
import type { PageTopic } from "./model";

type Problem = { kind: "locked" | "busy" | "signin" | "gone" | "error"; message: string };

/** Keep the take-off animation on screen at least this long before the Run page loads. */
const MIN_LAUNCH_MS = 650;

export function PlayButton({
  gameId,
  label,
  accent,
  topic,
  backHref,
  onLaunch,
}: {
  gameId: string;
  label: string;
  accent: string;
  topic: PageTopic | null;
  backHref: string;
  onLaunch: (launching: boolean) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(
    topic?.locked ? { kind: "locked", message: "Pass the previous Topic first." } : null,
  );

  async function play() {
    if (pending) return;
    sfx.unlock();
    sfx.whoosh();
    setPending(true);
    setProblem(null);
    onLaunch(true);
    const started = performance.now();
    try {
      const res = await fetch(`/api/games/${gameId}/runs`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (res.ok && body.runId) {
        const wait = MIN_LAUNCH_MS - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        router.push(`/runs/${body.runId}`);
        return; // stay "launching" while the Run page loads
      }
      sfx.error();
      if (res.status === 403) setProblem({ kind: "locked", message: "Pass the previous Topic first." });
      else if (res.status === 409) {
        setProblem({ kind: "busy", message: body.error ?? "This Game can't be played right now." });
        router.refresh();
      } else if (res.status === 401) setProblem({ kind: "signin", message: "Sign in to play." });
      else if (res.status === 404) setProblem({ kind: "gone", message: "This Game isn't here any more." });
      else setProblem({ kind: "error", message: "Something went wrong starting the Run. Try again." });
    } catch {
      sfx.error();
      setProblem({ kind: "error", message: "Couldn't reach the server. Check your connection and try again." });
    }
    setPending(false);
    onLaunch(false);
  }

  const locked = problem?.kind === "locked";
  const prevHref = topic?.prev ? `/explore/${topic.courseSlug}/${topic.prev.slug}` : null;

  return (
    <div className="grid gap-2">
      <Button
        variant="primary"
        size="lg"
        block
        disabled={pending || locked}
        onClick={play}
        icon={locked ? <PixelIcon name="lock" size={20} /> : undefined}
        aria-describedby={problem ? `play-problem-${gameId}` : undefined}
        className="!h-16 text-xl tracking-[0.12em]"
        style={{ boxShadow: pending ? `0 0 28px -4px ${accent}` : undefined }}
      >
        {pending ? "STARTING…" : locked ? "LOCKED" : label}
      </Button>
      <div id={`play-problem-${gameId}`} role="status" aria-live="polite" className="min-h-[1.25rem] text-center text-sm">
        {problem && (
          <span className={`inline-flex flex-wrap items-center justify-center gap-x-2 ${problem.kind === "locked" ? "text-caution" : "text-danger"}`}>
            <span>{problem.message}</span>
            {problem.kind === "locked" && prevHref && topic?.prev && (
              <Link href={prevHref} className="text-signal underline-offset-4 hover:underline">
                Go to Topic {topic.prev.number}: {topic.prev.title} →
              </Link>
            )}
            {problem.kind === "signin" && (
              <Link href="/sign-in" className="text-signal underline-offset-4 hover:underline">
                Sign in →
              </Link>
            )}
            {problem.kind === "gone" && (
              <Link href={backHref} className="text-signal underline-offset-4 hover:underline">
                Go back →
              </Link>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
