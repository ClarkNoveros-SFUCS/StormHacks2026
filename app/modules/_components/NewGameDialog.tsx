"use client";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ModeTile } from "@/components/ui/ModeTile";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { MODES, MODE_IDS, type AvailableModeId, type ModeId } from "@/lib/modes";
import { MODE_UI } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import { KIND_LABEL, thinMaterialHint } from "../_lib/mode-words";
import type { DocRow } from "../_lib/types";
import { DocIcon } from "./DocIcon";
import s from "./modules.module.css";

export type NewGameInput = { title: string; mode: AvailableModeId; sourceDocumentIds: string[] };

type Props = {
  open: boolean;
  onClose: () => void;
  moduleName: string;
  readyDocs: DocRow[];
  /** Resolves when the Game is created; rejects with a user-facing message. */
  onCreate: (input: NewGameInput) => Promise<void>;
};

/** New Game: pick a Game Mode (Dive preselected), name it, choose Ready files (≥ 1), Create. */
export function NewGameDialog(props: Props) {
  // Remount on each open so the form starts fresh.
  if (!props.open) return null;
  return <Dialog {...props} />;
}

function Dialog({ open, onClose, moduleName, readyDocs, onCreate }: Props) {
  const [mode, setMode] = useState<AvailableModeId>("dive");
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(readyDocs.map((d) => d.id)));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const m = MODES[mode];
  const chosen = readyDocs.filter((d) => picked.has(d.id));
  const pages = chosen.reduce((n, d) => n + (d.page_count ?? 0), 0);
  const hint = thinMaterialHint(mode, pages, chosen.length);
  const placeholder = `${moduleName} · ${m.name}`;

  const toggle = (id: string) => {
    sfx.toggle();
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const create = async () => {
    if (!chosen.length || pending) return;
    setPending(true);
    setError(null);
    try {
      await onCreate({ title: (title.trim() || placeholder).slice(0, 120), mode, sourceDocumentIds: chosen.map((d) => d.id) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the Game");
      sfx.error();
      setPending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={pending ? () => {} : onClose}
      title="New Game"
      className="max-w-3xl!"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={!chosen.length || pending} icon={<span aria-hidden="true">{MODE_UI[mode].icon}</span>}>
            {pending ? "Creating…" : `Create ${m.name} Game`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 font-display text-[13px] tracking-[.2em] text-muted uppercase">1 · Pick a Game Mode</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {MODE_IDS.map((id: ModeId) => (
              <ModeTile
                key={id}
                mode={id}
                locked={!MODES[id].available}
                selected={id === mode}
                onSelect={(next) => setMode(next as AvailableModeId)}
              />
            ))}
          </div>
          <div
            key={mode}
            className={`${s.summary} flex flex-col gap-2 rounded-md border p-3`}
            style={{
              borderColor: `color-mix(in srgb, ${MODE_UI[mode].accent} 45%, transparent)`,
              background: `color-mix(in srgb, ${MODE_UI[mode].accent} 7%, transparent)`,
            }}
          >
            <p className="text-[15px] text-text">
              <span className="font-display" style={{ color: MODE_UI[mode].accent }}>
                {m.name}:
              </span>{" "}
              {m.rules}
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13px] text-faint">Prompt kinds</span>
              {m.kinds.map((k) => (
                <span key={k} className="rounded-sm border border-border bg-bg-2/70 px-2 py-0.5 text-[12px] text-muted">
                  {KIND_LABEL[k]}
                </span>
              ))}
            </div>
          </div>
        </fieldset>

        <label className="flex flex-col gap-2">
          <span className="font-display text-[13px] tracking-[.2em] text-muted uppercase">2 · Name it</span>
          <input
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder={placeholder}
            className="h-11 w-full rounded-sm border border-border-strong bg-bg-2 px-3 text-text placeholder:text-faint focus:border-signal focus:outline-none"
          />
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 flex w-full items-center justify-between font-display text-[13px] tracking-[.2em] text-muted uppercase">
            <span>3 · Build it from</span>
            {readyDocs.length > 1 && (
              <button
                type="button"
                onClick={() => setPicked(picked.size === readyDocs.length ? new Set() : new Set(readyDocs.map((d) => d.id)))}
                className="font-sans text-[13px] tracking-normal text-signal normal-case hover:underline"
              >
                {picked.size === readyDocs.length ? "Select none" : "Select all"}
              </button>
            )}
          </legend>
          {readyDocs.length === 0 ? (
            <p className="rounded-sm border border-dashed border-border p-3 text-sm text-muted">
              No Ready files yet. Upload a file and wait for it to finish parsing.
            </p>
          ) : (
            <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
              {readyDocs.map((d) => {
                const on = picked.has(d.id);
                return (
                  <li key={d.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 transition ${
                        on ? "border-signal bg-[color-mix(in_srgb,var(--signal)_8%,transparent)]" : "border-border hover:border-border-strong"
                      }`}
                    >
                      <input type="checkbox" checked={on} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[var(--signal)]" />
                      <DocIcon filename={d.filename} size={18} />
                      <span className="min-w-0 flex-1 truncate text-text">{d.filename}</span>
                      <span className="text-[13px] text-faint">{d.page_count ?? "?"} p.</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {readyDocs.length > 0 && !chosen.length && <p className="text-sm text-caution">Choose at least one file.</p>}
          {hint && (
            <p className="flex items-start gap-2 rounded-sm border border-[color-mix(in_srgb,var(--caution)_40%,transparent)] bg-[color-mix(in_srgb,var(--caution)_8%,transparent)] px-3 py-2 text-sm text-text/90">
              <PixelIcon name="lantern" size={16} className="mt-0.5 shrink-0" />
              <span>{hint}</span>
            </p>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="animate-shake rounded-sm bg-[color-mix(in_srgb,var(--danger)_12%,transparent)] px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
