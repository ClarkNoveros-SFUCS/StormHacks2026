"use client";
// The slide panel (#75): on a Reveal, an Evidence link opens its page in a drawer on the right
// instead of leaving the page. It shows Gemini's tidy study notes for the page (written on first
// view, then stored; the parsed text if they can't be written), ←/→ between pages, and a link to
// the file's study page. EvidenceLine opens it through `useSlidePanel`.
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { DocIcon } from "@/app/modules/_components/DocIcon";
import { MarkdownView } from "@/app/modules/_components/MarkdownView";
import { api } from "@/app/modules/_lib/client";
import { loadPageNotes } from "@/app/modules/_lib/notes";
import type { DocumentPages } from "@/app/modules/_lib/types";
import { PixelIcon } from "@/components/ui/PixelIcon";
import type { Evidence } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import s from "@/app/modules/_components/modules.module.css";

type Open = { evidence: NonNullable<Evidence>; href: string };
type Opened = Open & { n: number };
type Ctx = { open: (o: Open) => void; current: Open | null };

const SlideCtx = createContext<Ctx | null>(null);

/** The panel's opener, or null outside a SlidePanelProvider (EvidenceLine then links normally). */
export function useSlidePanel() {
  return useContext(SlideCtx);
}

export function SlidePanelProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Opened | null>(null);
  // Every click remounts the panel on the clicked Evidence's page, even the same link again.
  const open = useCallback((o: Open) => setCurrent((c) => ({ ...o, n: (c?.n ?? 0) + 1 })), []);
  const value = useMemo(() => ({ open, current }), [open, current]);
  return (
    <SlideCtx.Provider value={value}>
      {children}
      {current && (
        <SlidePanel
          key={current.n}
          target={current}
          onClose={() => {
            sfx.click();
            setCurrent(null);
          }}
        />
      )}
    </SlideCtx.Provider>
  );
}

// Per tab: a document's pages. Notes are cached in loadPageNotes.
const pagesCache = new Map<string, Promise<DocumentPages>>();

function loadPages(documentId: string) {
  let p = pagesCache.get(documentId);
  if (!p) {
    p = api<DocumentPages>(`/api/documents/${documentId}/pages`);
    p.catch(() => pagesCache.delete(documentId));
    pagesCache.set(documentId, p);
  }
  return p;
}

function SlidePanel({ target, onClose }: { target: Open; onClose: () => void }) {
  const { evidence, href } = target;
  const [data, setData] = useState<DocumentPages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(evidence.pageNumber);
  const [notes, setNotes] = useState<Record<number, string | null | undefined>>({});
  const titleId = useId();
  const panel = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    loadPages(evidence.documentId)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [evidence.documentId]);

  useEffect(() => {
    if (notes[page] !== undefined) return;
    let live = true;
    loadPageNotes(evidence.documentId, page).then((md) => live && setNotes((n) => ({ ...n, [page]: md })));
    return () => {
      live = false;
    };
  }, [evidence.documentId, page, notes]);

  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [page]);

  const count = data?.pages.length ?? 0;
  const go = useCallback(
    (n: number) => {
      if (!count) return;
      const next = Math.max(1, Math.min(count, n));
      setPage((p) => {
        if (p !== next) sfx.tick();
        return next;
      });
    },
    [count],
  );

  // Esc closes; ←/→ turn pages unless typing. Focus moves into the panel when it opens.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(page + 1);
      else if (e.key === "ArrowLeft") go(page - 1);
    };
  });
  useEffect(() => {
    sfx.whoosh();
    const prev = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panel.current?.focus());
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);

  const raw = data?.pages.find((p) => p.pageNumber === page)?.contentMd;
  const md = notes[page];
  const notesFailed = md === null;
  const showRaw = notesFailed;
  const filename = data?.document.filename ?? evidence.documentTitle;
  const onEvidencePage = page === evidence.pageNumber;

  return (
    <>
      {/* A dim layer on small screens only, where the panel covers the page. */}
      <div className="fixed inset-0 z-[79] bg-[#03050c]/60 lg:hidden" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[560px] flex-col border-l border-border-strong bg-surface shadow-[-24px_0_60px_-20px_rgba(0,0,0,.7)] outline-none"
        style={{ animation: "slide-panel-in .32s var(--ease-out) both" }}
      >
        <style>{`@keyframes slide-panel-in{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}`}</style>

        <header className="flex items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-3">
          <DocIcon filename={filename} size={24} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-text">
              {filename}
            </h2>
            <p className="font-hud text-[17px] leading-none text-muted">
              PAGE {page}
              {count ? ` OF ${count}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the slide panel"
            className="grid h-9 w-9 place-items-center rounded-sm text-muted transition hover:bg-surface hover:text-text"
          >
            ✕
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => go(page - 1)}
            disabled={page <= 1 || !count}
            className="px-btn h-8 px-2.5 text-[13px]"
            data-variant="ghost"
            aria-label="Previous page"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => go(page + 1)}
            disabled={page >= count}
            className="px-btn h-8 px-2.5 text-[13px]"
            data-variant="ghost"
            aria-label="Next page"
          >
            →
          </button>
        </div>

        <div ref={body} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {onEvidencePage && evidence.quote && (
            <figure className="mb-5 rounded-sm border border-signal/40 bg-[color-mix(in_srgb,var(--signal)_8%,transparent)] px-3 py-2.5">
              <figcaption className="mb-1 font-display text-[11px] tracking-[.2em] text-signal uppercase">The answer is here</figcaption>
              <blockquote className="font-sans text-[14px] leading-snug text-text/90 italic">“{evidence.quote}”</blockquote>
            </figure>
          )}

          {error && (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <PixelIcon name="cross" size={24} />
              <p className="text-danger">{error}</p>
            </div>
          )}

          {!error && showRaw && raw !== undefined && (
            <div key={`raw-${page}`} className={s.pageIn}>
              {notesFailed && (
                <p className="mb-3 text-[13px] text-caution">Couldn&apos;t tidy this page right now, so here&apos;s the text as parsed.</p>
              )}
              <MarkdownView md={raw} query={onEvidencePage ? (evidence.quote ?? "") : ""} />
            </div>
          )}

          {!error && !showRaw && typeof md === "string" && (
            <div key={`notes-${page}`} className={s.pageIn}>
              {md.trim() ? <MarkdownView md={md} variant="notes" /> : <p className="text-faint italic">This page has no text.</p>}
            </div>
          )}

          {!error && ((showRaw && raw === undefined) || (!showRaw && md === undefined)) && (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the page">
              {!showRaw && <p className="font-hud text-[17px] text-muted">TIDYING THE SLIDE INTO NOTES…</p>}
              <div className={`${s.skeleton} h-7 w-2/3`} />
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className={`${s.skeleton} h-4`} style={{ width: `${92 - ((i * 13) % 40)}%` }} />
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-[12px] text-faint">
          <span className="flex-1">
            {!notesFailed ? "Notes tidied by AI from your file's text. Check the original if in doubt." : "Text as parsed from your file."}
          </span>
          <Link href={`${href.split("?")[0]}?page=${page}`} className="text-signal underline-offset-2 hover:underline">
            Study the whole file →
          </Link>
        </footer>
      </aside>
    </>
  );
}
