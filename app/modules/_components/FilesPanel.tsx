"use client";
import { useRef, useState } from "react";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { StatusPill, type Status } from "@/components/ui/StatusPill";
import { Tooltip } from "@/components/ui/Tooltip";
import { sfx } from "@/lib/ui/sfx";
import { formatBytes } from "../_lib/files";
import type { DocRow, UploadItem } from "../_lib/types";
import { DocIcon } from "./DocIcon";
import s from "./modules.module.css";

type Props = {
  docs: DocRow[];
  uploads: UploadItem[];
  /** Titles of the Games built from each file. */
  usedBy: Map<string, string[]>;
  hoverDocId: string | null;
  onHover: (id: string | null) => void;
  removing: Set<string>;
  freshIds: Set<string>;
  onFiles: (files: File[]) => void;
  onOpen: (doc: DocRow) => void;
  onDelete: (doc: DocRow) => void;
};

export function docStatus(d: DocRow): Status {
  return d.status === "parsed" ? "ready" : d.status === "failed" ? "failed" : "parsing";
}

export function FilesPanel({ docs, uploads, usedBy, hoverDocId, onHover, removing, freshIds, onFiles, onOpen, onDelete }: Props) {
  const count = docs.length + uploads.length;
  return (
    <section aria-labelledby="files-title" className="card flex flex-col gap-4 p-4 sm:p-5">
      <header className="flex items-center gap-3">
        <h2 id="files-title" className="label-line flex-1 !text-[13px]">
          Files <span className="text-faint">· {count}</span>
        </h2>
      </header>

      <DropZone onFiles={onFiles} compact={count > 0} />

      {count > 0 ? (
        <ul className="flex flex-col gap-2" onMouseLeave={() => onHover(null)}>
          {uploads.map((u) => (
            <li key={u.key} className={`${s.rowIn} card flex flex-col gap-2 p-3`}>
              <div className="flex items-center gap-3">
                <DocIcon filename={u.filename} />
                <span className="min-w-0 flex-1 truncate font-medium text-text">{u.filename}</span>
                <StatusPill status="uploading" />
              </div>
              <div className="flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)} aria-label={`Uploading ${u.filename}`}>
                  <div className={`${s.uploadBar} h-full rounded-full`} style={{ width: `${Math.max(4, u.progress * 100)}%` }} />
                </div>
                <span className="w-24 text-right font-hud text-lg leading-none text-muted">
                  {Math.round(u.progress * 100)}% · {formatBytes(u.size)}
                </span>
              </div>
            </li>
          ))}
          {docs.map((d, i) => (
            <FileRow
              key={d.id}
              doc={d}
              index={i}
              usedBy={usedBy.get(d.id) ?? []}
              lit={hoverDocId === d.id}
              leaving={removing.has(d.id)}
              fresh={freshIds.has(d.id)}
              onHover={onHover}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FileRow({
  doc,
  index,
  usedBy,
  lit,
  leaving,
  fresh,
  onHover,
  onOpen,
  onDelete,
}: {
  doc: DocRow;
  index: number;
  usedBy: string[];
  lit: boolean;
  leaving: boolean;
  fresh: boolean;
  onHover: (id: string | null) => void;
  onOpen: (doc: DocRow) => void;
  onDelete: (doc: DocRow) => void;
}) {
  const status = docStatus(doc);
  const ready = status === "ready";
  const used = usedBy.length;
  const guard = used ? `Used by ${usedBy.join(", ")}. Delete ${used === 1 ? "that Game" : "those Games"} first.` : null;

  return (
    <li
      data-doc={doc.id}
      onMouseEnter={() => onHover(doc.id)}
      onFocus={() => onHover(doc.id)}
      className={`${leaving ? s.rowOut : s.rowIn} ${lit ? s.lit : ""} ${fresh ? "animate-pop-in" : ""} card flex items-center gap-3 p-3 transition`}
      style={{ "--i": index } as React.CSSProperties}
    >
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          sfx.click();
          onOpen(doc);
        }}
        onMouseEnter={() => ready && sfx.hover()}
        className="group flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left disabled:cursor-default"
        aria-label={ready ? `View the parsed text of ${doc.filename}` : doc.filename}
      >
        <span className="transition group-enabled:group-hover:-translate-y-0.5 group-enabled:group-hover:rotate-[-4deg]">
          <DocIcon filename={doc.filename} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-medium text-text group-enabled:group-hover:text-signal">{doc.filename}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <StatusPill status={status} />
            {ready && doc.page_count != null && (
              <span>
                {doc.page_count} page{doc.page_count === 1 ? "" : "s"}
              </span>
            )}
            {ready && (
              <span className={used ? "text-text/80" : "text-faint"}>
                {used ? `Used by ${used} Game${used === 1 ? "" : "s"}` : "Not used yet"}
              </span>
            )}
            {ready && (
              <span aria-hidden="true" className="hidden text-signal opacity-0 transition group-hover:opacity-100 sm:inline">
                View text →
              </span>
            )}
          </span>
          {status === "failed" && doc.error && (
            <span className="text-[13px] leading-snug text-danger">
              {doc.error.replace(/\.\s*$/, "")}. Delete it and upload it again.
            </span>
          )}
        </span>
      </button>

      {guard ? (
        <Tooltip label={guard} side="top">
          <button
            type="button"
            aria-disabled="true"
            aria-label={`Delete ${doc.filename} (unavailable: ${guard})`}
            onClick={() => sfx.error()}
            className="grid h-9 w-9 shrink-0 cursor-not-allowed place-items-center rounded-sm text-faint opacity-50"
          >
            <PixelIcon name="lock" size={14} />
          </button>
        </Tooltip>
      ) : (
        <button
          type="button"
          disabled={status === "parsing"}
          onClick={() => {
            sfx.click();
            onDelete(doc);
          }}
          aria-label={`Delete ${doc.filename}`}
          title="Delete"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm text-muted transition hover:bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] hover:text-danger disabled:opacity-30"
        >
          ✕
        </button>
      )}
    </li>
  );
}

const ACCEPT = ".pdf,.pptx,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function DropZone({ onFiles, compact }: { onFiles: (files: File[]) => void; compact: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div
      role="button"
      tabIndex={0}
      data-over={over ? "true" : undefined}
      aria-label="Upload files: drop PDF, PPTX or DOCX here, or press Enter to choose"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        depth.current++;
        if (!over) sfx.hover();
        setOver(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={`${s.drop} flex cursor-pointer items-center gap-4 rounded-md ${compact ? "px-4 py-4" : "flex-col px-6 py-10 text-center"}`}
    >
      <span className={`${s.dropDoc} relative inline-flex`}>
        <PixelIcon name="doc" size={compact ? 30 : 48} />
        <span className="absolute -top-1 -right-2 grid h-5 w-5 place-items-center rounded-full bg-primary font-display text-sm leading-none text-primary-text">
          +
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-text">{over ? "Drop to upload" : compact ? "Drop more files, or click to choose" : "Drop your slides and notes here"}</span>
        <span className="text-[13px] text-muted">PDF, PPTX or DOCX · up to 25 MB and 100 pages</span>
      </span>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
