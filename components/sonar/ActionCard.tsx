"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ModeBadge } from "@/components/ui/ModeTile";
import { useToast } from "@/components/ui/Toast";
import { MODES } from "@/lib/modes";
import type { GameSummary } from "@/lib/games/types";
import { announceGameCreated, createdGameFor } from "@/lib/sonar/client";
import type { Action } from "@/lib/sonar/types";
import { sfx } from "@/lib/ui/sfx";

function pickLabel(a: Action, index?: number): { text: string; tone: "reward" | "signal" | "violet" } {
  if (a.source === "sonar") return { text: "Sonar's pick", tone: "violet" };
  const rank = (a.kind === "play" ? a.rank : null) ?? index ?? null;
  if (rank === null) return { text: "Planner", tone: "signal" };
  if (rank === 0) return { text: "Top pick", tone: "reward" };
  return { text: `Planner #${rank + 1}`, tone: "signal" };
}

/**
 * One recommendation from Sonar or the planner (F32): play a Game, make a Game from Module files
 * (confirm first), or read something. Used in the buddy drawer and on /sonar.
 */
export function ActionCard({ action, index, onNavigate }: { action: Action; /** Planner position, for actions without a rank. */ index?: number; onNavigate?: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const key = action.kind === "create_game" ? `${action.moduleId}:${action.mode}:${action.title}:${action.sourceDocumentIds.join(",")}` : "";
  const [done, setDone] = useState(() => !!key && !!createdGameFor(key));
  const [problem, setProblem] = useState<string | null>(null);
  const label = pickLabel(action, index);

  async function start() {
    if (action.kind !== "play" || busy) return;
    sfx.unlock();
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/games/${action.gameId}/runs`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (res.ok && body.runId) {
        sfx.whoosh();
        onNavigate?.();
        router.push(`/runs/${body.runId}`);
        return;
      }
      sfx.error();
      setProblem(res.status === 403 ? "Pass the previous Topic first." : body.error ?? "Couldn't start that Game. Try again.");
    } catch {
      setProblem("Couldn't reach the server. Try again.");
    }
    setBusy(false);
  }

  async function create() {
    if (action.kind !== "create_game" || busy || done) return;
    setBusy(true);
    setProblem(null);
    try {
      const res = await fetch(`/api/modules/${action.moduleId}/games`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: action.title, mode: action.mode, sourceDocumentIds: action.sourceDocumentIds }),
      });
      const body = (await res.json().catch(() => ({}))) as { game?: GameSummary; error?: string };
      if (!res.ok || !body.game) throw new Error(body.error ?? "Couldn't make that Game.");
      setDone(true);
      announceGameCreated(key, body.game);
      sfx.reward();
      toast({ title: `Generating ${action.title}…`, body: "About a minute. It's in this Module's Games, and you'll get a note when it's ready.", tone: "info", icon: "sparkle" });
    } catch (e) {
      sfx.error();
      setProblem(e instanceof Error ? e.message : "Couldn't make that Game.");
    }
    setBusy(false);
  }

  return (
    <article className="rounded-md border border-border bg-bg-2 p-3 text-left">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Chip tone={label.tone}>{label.text}</Chip>
        {action.kind !== "read" && <ModeBadge mode={action.mode} />}
        {action.kind === "read" && <Chip tone="neutral">Read</Chip>}
      </div>
      <h4 className="font-display text-[15px] leading-snug text-text">{action.title}</h4>
      <p className="mt-1 text-[13px] leading-snug text-muted">{action.why}</p>
      {action.kind === "create_game" && (
        <p className="mt-1 text-[13px] text-faint">
          {MODES[action.mode].name} · {action.sourceDocumentIds.length} file{action.sourceDocumentIds.length === 1 ? "" : "s"}
        </p>
      )}
      {action.kind === "create_game" && done && (
        <p className="mt-2 text-[13px] text-signal">Building in the background. It shows up in this Module&apos;s Games, ready in about a minute.</p>
      )}
      <div className="mt-3 flex items-center gap-3">
        {action.kind === "play" && (
          <Button variant="primary" size="sm" onClick={start} disabled={busy} aria-label={`Start ${action.title}`}>
            {busy ? "Starting…" : "Start"}
          </Button>
        )}
        {action.kind === "create_game" && (
          <Button variant="primary" size="sm" onClick={create} disabled={busy || done}>
            {done ? "Generating…" : busy ? "Making…" : "Make this Game"}
          </Button>
        )}
        {action.kind === "read" && (
          <Link href={action.href} onClick={onNavigate} className="font-display text-[14px] text-signal underline-offset-4 hover:underline">
            Open the reading →
          </Link>
        )}
        {problem && (
          <span role="alert" className="text-[13px] text-caution">
            {problem}
          </span>
        )}
      </div>
    </article>
  );
}
