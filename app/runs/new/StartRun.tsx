"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DepthRuler } from "@/components/modes/dive/DepthRuler";
import { DiveCamera } from "@/components/modes/dive/depth";
import { OceanStage } from "@/components/modes/dive/OceanStage";
import { RoundCard } from "@/components/round/RoundCard";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { RunApiError, runApi } from "@/lib/runs/client";
import { modeUi } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";

type Props = { gameId: string; gameTitle: string; mode: string };

/** The launch beat: the ocean at the surface and `▼ BEGIN DESCENT ▼` (or the Mode's verb). */
export function StartRun({ gameId, gameTitle, mode }: Props) {
  const router = useRouter();
  const [camera] = useState(() => new DiveCamera());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = modeUi(mode);

  const start = async () => {
    if (pending) return;
    sfx.unlock();
    sfx.whoosh();
    setPending(true);
    setError(null);
    try {
      const { runId } = await runApi.create(gameId);
      router.push(`/runs/${runId}`);
    } catch (e) {
      setPending(false);
      setError(e instanceof RunApiError ? e.message : "Couldn't start the run");
    }
  };

  return (
    <div data-theme="dive" className="relative isolate h-[100dvh] w-full overflow-hidden bg-bg font-hud text-text">
      <OceanStage camera={camera} sky="day" showMascot />
      <DepthRuler camera={camera} className="z-[1]" />
      <div className="absolute top-4 right-16 z-20 sm:right-24">
        <SoundToggle />
      </div>
      <div className="absolute inset-0 z-10 flex flex-col pr-16 pl-4 sm:px-24">
        <div className="h-[25%] shrink-0" />
        <div className="mx-auto w-full max-w-[640px] pt-2">
          <RoundCard
            label={ui.name.toUpperCase()}
            text={gameTitle}
            footer={`${ui.rules.toUpperCase()} · ${mode === "dive" ? "▼ RARER ANSWERS SINK DEEPER ▼" : ui.tagline.toUpperCase()}`}
          />
        </div>
        <div className="flex flex-1 flex-col items-center justify-end gap-4 pb-[max(24px,env(safe-area-inset-bottom))] sm:pb-12">
          {error && (
            <p className="text-[18px] text-danger" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            autoFocus
            onClick={start}
            disabled={pending}
            className="px-8 py-3 text-[24px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] disabled:opacity-60 sm:text-[28px]"
            style={{
              background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
              boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
              animation: pending ? undefined : "btn-bob 2.4s ease-in-out infinite",
            }}
          >
            {pending ? "▼ …" : `${ui.icon} ${ui.verb} ${ui.icon}`}
          </button>
          <Link href={`/games/${gameId}`} className="text-[18px] tracking-[0.25em] text-muted underline-offset-4 hover:text-signal hover:underline">
            BACK TO GAME
          </Link>
        </div>
      </div>
    </div>
  );
}
