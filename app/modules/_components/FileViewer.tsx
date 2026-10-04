"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { sfx } from "@/lib/ui/sfx";
import { api } from "../_lib/client";
import { countMatches, pageTitle } from "../_lib/markdown";
import type { DocumentPages } from "../_lib/types";
import { DocIcon } from "./DocIcon";
import { MarkdownView } from "./MarkdownView";
import s from "./modules.module.css";

// The file viewer (overnight-decisions §10): the parsed text of a Source Document, page by page.
// Page list on the left, the page's markdown on the right, search that highlights and jumps
// between matching pages, ←/→ between pages. Deep-linked as ?doc=<id>&page=<n> by the parent.

const cache = new Map<string, DocumentPages>();

type Props = {
  documentId: string;
  filename: string;
  initialPage: number;
  onClose: () => void;
  /** Called with the 1-based page number whenever it changes (the parent mirrors it in the URL). */
  onPage?: (page: number) => void;
};

export function FileViewer({ documentId, filename, initialPage, onClose, onPage }: Props) {
  const [data, setData] = useState<DocumentPages | null>(() => cache.get(documentId) ?? null);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(Math.max(0, initialPage - 1));
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (cache.has(documentId)) return;
    let live = true;
    api<DocumentPages>(`/api/documents/${documentId}/pages`)
      .then((d) => {
        cache.set(documentId, d);
        if (live) setData(d);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [documentId]);

  const pages = useMemo(() => data?.pages ?? [], [data]);
  const titles = useMemo(() => pages.map((p) => pageTitle(p.contentMd, 48)), [pages]);
  const hits = useMemo(() => pages.map((p) => countMatches(p.contentMd, query)), [pages, query]);
  const total = hits.reduce((a, b) => a + b, 0);
  const hitPages = hits.filter(Boolean).length;
  const current = pages.length ? Math.min(index, pages.length - 1) : 0;

  const onPageRef = useRef(onPage);
  useEffect(() => {
    onPageRef.current = onPage;
  });
  useEffect(() => {
    if (pages.length) onPageRef.current?.(current + 1);
  }, [current, pages.length]);

  // Keep the selected page visible in the list, and bring the first match into view.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
    const mark = content.current?.querySelector("mark");
    if (mark) {
      mark.setAttribute("data-current", "true");
      mark.scrollIntoView({ block: "center" });
    } else content.current?.scrollTo({ top: 0 });
  }, [current, query, pages.length]);

  const go = (i: number) => {
    if (!pages.length) return;
    const next = Math.max(0, Math.min(pages.length - 1, i));
    if (next !== current) sfx.tick();
    setIndex(next);
  };

  /** Next (dir 1) or previous (dir −1) page with a match, wrapping around. */
  const jump = (dir: 1 | -1) => {
    if (!total) return;
    for (let step = 1; step <= pages.length; step++) {
      const i = (current + dir * step + pages.length * 2) % pages.length;
      if (hits[i]) {
        go(i);
        return;
      }
    }
  };

  // Dialog behaviour: Escape, focus trap, scroll lock, arrows between pages.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      } else if (!typing && (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown")) {
        e.preventDefault();
        go(current + 1);
      } else if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp")) {
        e.preventDefault();
        go(current - 1);
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        dialog.current?.querySelector<HTMLInputElement>("input[type=search]")?.focus();
      } else if (e.key === "Tab") {
        const f = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])') ?? [],
        );
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sfx.whoosh();
    requestAnimationFrame(() => dialog.current?.focus());
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, []);

  const page = pages[current];

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div className="absolute inset-0 bg-[#03050c]/80 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${s.viewer} absolute inset-0 mx-auto flex max-w-6xl flex-col overflow-hidden border-border-strong bg-surface shadow-2xl outline-none sm:inset-4 sm:rounded-lg sm:border lg:inset-x-8 lg:inset-y-8`}
      >
        {/* Header */}
        <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2/60 px-4 py-3 sm:px-5">
          <DocIcon filename={filename} size={26} />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg text-text">
              {filename}
            </h2>
            <p className="text-[13px] text-muted">Parsed text of your file (the original isn&apos;t stored)</p>
          </div>
          <div className="order-last flex w-full items-center gap-2 sm:order-none sm:w-auto">
            <label className="relative flex-1 sm:w-64 sm:flex-none">
              <span className="sr-only">Search in this file</span>
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 opacity-70">
                <PixelIcon name="eye" size={14} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  const q = e.target.value;
                  setQuery(q);
                  // Jump to the first page with a match at or after the current one.
                  const counts = pages.map((p) => countMatches(p.contentMd, q));
                  if (q.trim() && !counts[current]) {
                    const at = counts.findIndex((n, i) => n > 0 && i >= current);
                    const first = at === -1 ? counts.findIndex((n) => n > 0) : at;
                    if (first !== -1) setIndex(first);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    jump(e.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Search this file  ( / )"
                className="h-10 w-full rounded-sm border border-border-strong bg-bg-2 pr-3 pl-8 text-[15px] text-text placeholder:text-faint focus:border-signal focus:outline-none"
              />
            </label>
            {query.trim() && (
              <div className="flex items-center gap-1" aria-live="polite">
                <span className="font-hud text-lg whitespace-nowrap text-muted">
                  {total ? `${total} in ${hitPages} p.` : "no match"}
                </span>
                <button type="button" onClick={() => jump(-1)} disabled={!total} aria-label="Previous page with a match" className="grid h-9 w-8 place-items-center rounded-sm text-muted hover:bg-surface hover:text-text disabled:opacity-40">
                  ▲
                </button>
                <button type="button" onClick={() => jump(1)} disabled={!total} aria-label="Next page with a match" className="grid h-9 w-8 place-items-center rounded-sm text-muted hover:bg-surface hover:text-text disabled:opacity-40">
                  ▼
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the file viewer"
            className="grid h-10 w-10 place-items-center rounded-sm text-muted transition hover:bg-surface hover:text-text"
          >
            ✕
          </button>
        </header>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav aria-label="Pages" className="shrink-0 border-b border-border sm:w-64 sm:border-r sm:border-b-0">
            <ol ref={list} className="flex gap-1.5 overflow-x-auto p-2 sm:h-full sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto">
              {!data && !error &&
                Array.from({ length: 6 }, (_, i) => (
                  <li key={i} className={`${s.skeleton} h-10 w-20 shrink-0 sm:w-full`} />
                ))}
              {pages.map((p, i) => {
                const on = i === current;
                const dim = query.trim() && !hits[i];
                return (
                  <li key={p.pageNumber} data-index={i} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-current={on ? "page" : undefined}
                      className={`group flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left transition ${
                        on
                          ? "border-signal bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                          : "border-transparent hover:border-border hover:bg-surface-2"
                      } ${dim ? "opacity-40" : ""}`}
                    >
                      <span className={`w-7 shrink-0 text-right font-hud text-xl leading-none ${on ? "text-signal" : "text-faint"}`}>
                        {p.pageNumber}
                      </span>
                      <span className="hidden min-w-0 flex-1 truncate text-[13px] text-muted group-hover:text-text sm:block">
                        {titles[i]}
                      </span>
                      {query.trim() && hits[i] > 0 && (
                        <span className="rounded-full bg-primary px-1.5 font-hud text-[15px] leading-tight text-primary-text">{hits[i]}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <main ref={content} className="min-h-0 flex-1 overflow-y-auto">
            {error && (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <PixelIcon name="cross" size={28} />
                <p className="text-danger">{error}</p>
              </div>
            )}
            {!data && !error && (
              <div className="flex flex-col gap-3 p-6 sm:p-8">
                <div className={`${s.skeleton} h-7 w-2/3`} />
                {Array.from({ length: 7 }, (_, i) => (
                  <div key={i} className={`${s.skeleton} h-4`} style={{ width: `${90 - ((i * 13) % 40)}%` }} />
                ))}
              </div>
            )}
            {data && pages.length === 0 && (
              <p className="p-10 text-center text-muted">No parsed pages yet. Ready files show their text here.</p>
            )}
            {page && (
              <article className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6 sm:px-8 sm:py-8">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-[12px] tracking-[.2em] text-faint uppercase">
                    Page {page.pageNumber} of {data?.document.pageCount ?? pages.length}
                  </span>
                  <span className="flex gap-2">
                    <button type="button" onClick={() => go(current - 1)} disabled={current === 0} className="px-btn h-8 px-3 text-[13px]" data-variant="ghost" aria-label="Previous page">
                      ← Prev
                    </button>
                    <button type="button" onClick={() => go(current + 1)} disabled={current >= pages.length - 1} className="px-btn h-8 px-3 text-[13px]" data-variant="ghost" aria-label="Next page">
                      Next →
                    </button>
                  </span>
                </div>
                <div key={`${page.pageNumber}`} className={s.pageIn}>
                  <MarkdownView md={page.contentMd} query={query} />
                </div>
                <p className="mt-6 border-t border-dashed border-border pt-3 text-center text-[13px] text-faint">
                  ← → to turn pages · / to search · Esc to close
                </p>
              </article>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
