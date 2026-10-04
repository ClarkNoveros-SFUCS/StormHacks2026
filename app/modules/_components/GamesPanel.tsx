"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Meter } from "@/components/ui/Meter";
import { ModeBadge, ModeScene } from "@/components/ui/ModeTile";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { StatusPill } from "@/components/ui/StatusPill";
import { MODES } from "@/lib/modes";
import { MODE_UI } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import { bestInWords } from "../_lib/mode-words";
import type { CardProgress, GameRow } from "../_lib/types";
import { DocIcon } from "./DocIcon";
import s from "./modules.module.css";

type Props = {
  games: GameRow[];
  progress: Record<string, CardProgress>;
  hoverDocId: string | null;
  onHover: (docId: string | null) => void;
  freshIds: Set<string>;
  removing: Set<string>;
  canCreate: boolean;
  onNewGame: () => void;
  onOpenDoc: (docId: string) => void;
  onDelete: (game: GameRow) => void;
};

export const isGenerating = (g: GameRow) => g.status === "queued" || g.status === "generating";

export function GamesPanel({
  games,
  progress,
  hoverDocId,
  onHover,
  freshIds,
  removing,
  canCreate,
  onNewGame,
  onOpenDoc,
  onDelete,
}: Props) {
  return (
    <section aria-labelledby="games-title" className="card flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <h2 id="games-title" className="label-line flex-1 !text-[13px]">
          Games <span className="text-faint">· {games.length}</span>
        </h2>
        <Button
          variant="primary"
          size="sm"
          onClick={onNewGame}
          icon={<span className="text-base leading-none">+</span>}
        >
          New Game
        </Button>
      </header>

      {games.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border px-6 py-10 text-center">
          <div className="flex gap-2">
            {(["dive", "apogee", "leap", "pairs", "blitz"] as const).map((m, i) => (
              <span
                key={m}
                className="font-display text-2xl animate-bob"
                style={{
                  color: MODE_UI[m].accent,
                  animationDelay: `${i * 0.15}s`,
                }}
                aria-hidden="true"
              >
                {MODE_UI[m].icon}
              </span>
            ))}
          </div>
          <p className="font-display text-text">No games yet</p>
          <p className="max-w-sm text-sm text-muted">
            {canCreate
              ? "Pick a Game Mode and the files to build it from. It takes about a minute."
              : "Upload a file first. Once it's Ready, you can build a Game from it."}
          </p>
          {canCreate && (
            <Button variant="primary" onClick={onNewGame}>
              Make your first Game
            </Button>
          )}
        </div>
      ) : (
        <ul className="flex flex-col gap-3" onMouseLeave={() => onHover(null)}>
          {games.map((g, i) => (
            <GameCard
              key={g.id}
              g={g}
              index={i}
              progress={progress[g.id]}
              lit={!!hoverDocId && g.sources.some((src) => src.id === hoverDocId)}
              hoverDocId={hoverDocId}
              onHover={onHover}
              fresh={freshIds.has(g.id)}
              leaving={removing.has(g.id)}
              onOpenDoc={onOpenDoc}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - Date.parse(since)) / 1000));
  return (
    <span className="font-hud text-lg leading-none text-muted tabular-nums">
      {sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`}
    </span>
  );
}

function GameCard({
  g,
  index,
  progress,
  lit,
  hoverDocId,
  onHover,
  fresh,
  leaving,
  onOpenDoc,
  onDelete,
}: {
  g: GameRow;
  index: number;
  progress: CardProgress | undefined;
  lit: boolean;
  hoverDocId: string | null;
  onHover: (docId: string | null) => void;
  fresh: boolean;
  leaving: boolean;
  onOpenDoc: (docId: string) => void;
  onDelete: (game: GameRow) => void;
}) {
  const generating = isGenerating(g);
  const mode = MODES[g.mode];
  const ui = MODE_UI[g.mode];
  const best = progress && progress.runs > 0 ? bestInWords(g.mode, progress.personalBest) : null;

  return (
    <li
      data-game={g.id}
      data-live={generating ? "true" : undefined}
      className={`${s.gameCard} card ${generating ? s.generating : ""} ${lit ? s.lit : ""} ${leaving ? s.rowOut : fresh ? s.gameNew : s.rowIn} flex flex-col gap-3 p-3 transition sm:p-4`}
      style={{ "--i": index, "--tile-accent": ui.accent } as React.CSSProperties}
    >
      <div className="flex gap-3">
        <div
          className={`${s.scene} aspect-[5/3] w-24 shrink-0 overflow-hidden rounded-sm border border-border sm:w-28`}
        >
          <ModeScene mode={g.mode} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 text-[17px] leading-snug break-words text-text">{g.title}</h3>
            <button
              type="button"
              onClick={() => {
                sfx.click();
                onDelete(g);
              }}
              aria-label={`Delete the Game ${g.title}`}
              title="Delete Game"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-faint transition hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-danger"
            >
              ✕
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={g.mode} />
            <StatusPill status={generating ? "generating" : g.status === "ready" ? "ready" : "failed"} />
            {g.status === "ready" && g.prompt_count != null && (
              <span className="text-[13px] text-faint">{g.prompt_count} prompts</span>
            )}
          </div>
        </div>
      </div>

      {g.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Built from">
          {g.sources.map((src) => (
            <button
              key={src.id}
              type="button"
              onMouseEnter={() => onHover(src.id)}
              onFocus={() => onHover(src.id)}
              onClick={() => {
                sfx.click();
                onOpenDoc(src.id);
              }}
              title={`Built from ${src.filename}. Click to read it.`}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-bg-2/70 px-2 py-1 text-[12px] text-muted transition hover:text-text ${
                hoverDocId === src.id ? s.chipLit : ""
              }`}
            >
              <DocIcon filename={src.filename} size={12} />
              <span className="truncate">{src.filename}</span>
            </button>
          ))}
        </div>
      )}

      {generating && (
        <div className="flex items-center justify-between gap-3 rounded-sm bg-bg-2/60 px-3 py-2">
          <span className="text-sm text-muted">
            Writing prompts from your files
            <span className={s.writing} aria-hidden="true">
              <span>.</span>
              <span>.</span>
              <span>.</span>
            </span>
          </span>
          <Elapsed since={g.created_at} />
        </div>
      )}

      {g.status === "failed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-[color-mix(in_srgb,var(--danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-3 py-2">
          <p className="min-w-0 flex-1 text-sm text-danger">
            {g.error ?? "Making this Game failed. Delete it and make it again."}
          </p>
          <Button variant="danger" size="sm" onClick={() => onDelete(g)}>
            Delete
          </Button>
        </div>
      )}

      {g.status === "ready" && (
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 border-t border-dashed border-border pt-3">
          <div className="flex min-w-[96px] flex-col gap-1">
            <span className="font-display text-[11px] tracking-widest text-faint uppercase">
              {best ? best.label : "Personal best"}
            </span>
            <span className={`font-hud text-[26px] leading-none ${best ? "text-reward" : "text-faint"}`}>
              {best ? best.value : "—"}
            </span>
          </div>
          <div className="flex min-w-[120px] flex-1 flex-col gap-1.5">
            <span className="flex justify-between font-display text-[11px] tracking-widest text-faint uppercase">
              <span>Mastery</span>
              <span className="text-muted">{progress?.masteryPct ?? 0}%</span>
            </span>
            <Meter value={progress?.masteryPct ?? 0} label={`Mastery of ${g.title}`} />
          </div>
          <Button href={`/games/${g.id}`} variant="primary" size="sm" iconRight={<PixelIcon name="bolt" size={12} />}>
            {mode.playVerb}
          </Button>
        </div>
      )}
    </li>
  );
}
