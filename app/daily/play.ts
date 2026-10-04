"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import type { DailyRunResponse } from "@/lib/daily/types";
import { RunApiError, runApi } from "@/lib/runs/client";
import { sfx } from "@/lib/ui/sfx";

async function startToday(): Promise<DailyRunResponse> {
  const res = await fetch("/api/daily/today/run", { method: "POST", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as DailyRunResponse & { error?: string };
  if (!res.ok) throw new RunApiError(res.status, body.error ?? `Request failed (${res.status})`);
  return body;
}

/**
 * Start a dive from the hub: today's puzzle (resumes your Run on it, else starts one; after your
 * counted dive it's practice) or a past puzzle from the archive (always practice).
 */
export function usePlay() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  const go = async (key: string, start: () => Promise<{ runId: string; note?: string }>) => {
    if (pending) return;
    sfx.whoosh();
    setPending(key);
    try {
      const { runId, note } = await start();
      if (note) toast({ title: note, tone: "info", icon: "bubble" });
      router.push(`/runs/${runId}`);
    } catch (e) {
      setPending(null);
      sfx.error();
      toast({ title: "Couldn't start the dive", body: e instanceof RunApiError ? e.message : "Try again in a moment.", tone: "danger" });
    }
  };

  return {
    pending,
    today: () =>
      go("today", async () => {
        const r = await startToday();
        return { runId: r.runId, note: r.resumed ? "Resuming your dive" : r.counted ? undefined : "Practice dive: your counted result stays on the board" };
      }),
    practice: (gameId: string) => go(gameId, () => runApi.create(gameId)),
  };
}
