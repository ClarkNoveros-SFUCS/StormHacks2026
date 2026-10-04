"use client";
// The study page (#75): a whole Source Document as tidy study notes, page after page, like a
// handout. Contents list (sticky on wide screens, a page picker on phones) that follows the
// scroll, ←/→ to jump between pages, and the Games built from the file to test yourself after.
// Pages without stored notes get them from Gemini as they come near the screen, three at a time.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ModeId } from "@/lib/modes";
import { modeUi } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import { pageTitle } from "../_lib/markdown";
import { loadPageNotes } from "../_lib/notes";
import { DocIcon } from "./DocIcon";
import { MarkdownView } from "./MarkdownView";
import s from "./modules.module.css";

type Page = { pageNumber: number; contentMd: string; notesMd: string | null };

type Props = {
  module: { id: string; name: string };
  document: { id: string; filename: string };
  pages: Page[];
  /** Ready Games built from this file. */
  games: { id: string; title: string; mode: ModeId }[];
  initialPage: number;
};

/** How many notes requests run at once. */
const PARALLEL = 3;

export function StudyNotes({ module: mod, document: doc, pages, games, initialPage }: Props) {
  // undefined = not loaded yet, null = couldn't be written (show the parsed text).
  const [notes, setNotes] = useState<Record<number, string | null | undefined>>(() =>
    Object.fromEntries(pages.map((p) => [p.pageNumber, p.notesMd ?? undefined])),
  );
  const [active, setActive] = useState(() => Math.min(initialPage, pages.length || 1));
  const toc = useRef<HTMLOListElement>(null);

  // ---- Notes loading: a small queue fed by what's near the screen --------------------------------
  const queue = useRef<number[]>([]);
  const running = useRef(0);
  const requested = useRef(new Set(pages.filter((p) => p.notesMd !== null).map((p) => p.pageNumber)));
  const pump = useRef<() => void>(() => {});
  useEffect(() => {
    pump.current = () => {
      while (running.current < PARALLEL && queue.current.length) {
        const n = queue.current.shift()!;
        running.current++;
        loadPageNotes(doc.id, n)
          .then((md) => setNotes((all) => ({ ...all, [n]: md })))
          .finally(() => {
            running.current--;
            pump.current();
          });
      }
    };
  });
  const want = useCallback((n: number, first = false) => {
    if (requested.current.has(n)) return;
    requested.current.add(n);
    if (first) queue.current.unshift(n);
    else queue.current.push(n);
    pump.current();
  }, []);

  // Load pages within ~1.5 screens; track the page being read (the one crossing 30% from the top).
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-study-page]"));
    const near = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) want(Number(e.target.getAttribute("data-study-page")));
      },
      { rootMargin: "1500px 0px" },
    );
    const spy = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number(e.target.getAttribute("data-study-page")));
      },
      { rootMargin: "-30% 0px -69% 0px" },
    );
    for (const el of sections) {
      near.observe(el);
      spy.observe(el);
    }
    return () => {
      near.disconnect();
      spy.disconnect();
    };
  }, [want]);

  // Open on ?page=N.
  useEffect(() => {
    if (initialPage <= 1) return;
    want(initialPage, true);
    document.getElementById(`p-${initialPage}`)?.scrollIntoView({ block: "start" });
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the page in the URL (shareable, survives reload) and keep it visible in the contents.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (active > 1) url.searchParams.set("page", String(active));
    else url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
    toc.current?.querySelector<HTMLElement>(`[data-toc="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const jump = useCallback(
    (n: number) => {
      const target = Math.max(1, Math.min(pages.length, n));
      want(target, true);
      sfx.tick();
      document.getElementById(`p-${target}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [pages.length, want],
  );

  // ←/→ between pages, unless typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || el?.closest("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        jump(active + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        jump(active - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, jump]);

  const titles = useMemo(
    () => pages.map((p) => pageTitle(notes[p.pageNumber] || p.contentMd, 52)),
    [pages, notes],
  );
  const total = pages.length;
  const pct = total ? Math.round((active / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="font-display text-[12px] tracking-[.2em] text-faint uppercase">
          <Link href="/modules" className="hover:text-text">
            My Modules
          </Link>{" "}
          /{" "}
          <Link href={`/modules/${mod.id}`} className="hover:text-text">
            {mod.name}
          </Link>{" "}
          / <span className="text-muted">Study</span>
        </nav>
        <div className="flex flex-wrap items-center gap-4">
          <DocIcon filename={doc.filename} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl break-words text-text sm:text-3xl">{doc.filename.replace(/\.[a-z0-9]+$/i, "")}</h1>
            <p className="text-[14px] text-muted">
              {total} page{total === 1 ? "" : "s"} of study notes · tidied by AI from your file&apos;s text
            </p>
          </div>
        </div>
        {games.length > 0 && <PractiseRow games={games} label="Test yourself" />}
      </header>

      {/* Phone: a sticky page picker. */}
      <div className="sticky top-16 z-30 -mx-1 flex items-center gap-2 rounded-md border border-border bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
        <label className="flex min-w-0 flex-1 items-center gap-2">
          <span className="sr-only">Jump to page</span>
          <span className="font-hud text-lg leading-none text-signal">
            {active}/{total}
          </span>
          <select
            value={active}
            onChange={(e) => jump(Number(e.target.value))}
            className="min-w-0 flex-1 truncate rounded-sm border border-border-strong bg-bg-2 px-2 py-1.5 text-[14px] text-text"
          >
            {pages.map((p, i) => (
              <option key={p.pageNumber} value={p.pageNumber}>
                {p.pageNumber}. {titles[i]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Contents */}
        <nav
          aria-label="Contents"
          className="card sticky top-24 hidden max-h-[calc(100vh-8rem)] flex-col gap-3 p-3 lg:flex"
        >
          <div className="flex items-center justify-between px-1">
            <span className="label-line !text-[12px]">Contents</span>
            <span className="font-hud text-lg leading-none text-muted">
              {active}/{total}
            </span>
          </div>
          <div className="mx-1 h-1.5 overflow-hidden rounded-full bg-bg-2" aria-hidden="true">
            <div className="h-full rounded-full bg-signal transition-[width] duration-300" style={{ width: `${pct}%` }} />
          </div>
          <ol ref={toc} className="-mr-1 flex flex-col gap-0.5 overflow-y-auto pr-1">
            {pages.map((p, i) => {
              const on = p.pageNumber === active;
              return (
                <li key={p.pageNumber}>
                  <button
                    type="button"
                    data-toc={p.pageNumber}
                    onClick={() => jump(p.pageNumber)}
                    aria-current={on ? "location" : undefined}
                    className={`flex w-full items-start gap-2 rounded-sm border px-2 py-1.5 text-left transition ${
                      on
                        ? "border-signal bg-[color-mix(in_srgb,var(--signal)_12%,transparent)]"
                        : "border-transparent hover:bg-surface-2"
                    }`}
                  >
                    <span className={`w-6 shrink-0 text-right font-hud text-lg leading-tight ${on ? "text-signal" : "text-faint"}`}>
                      {p.pageNumber}
                    </span>
                    <span className={`min-w-0 flex-1 text-[13px] leading-snug ${on ? "text-text" : "text-muted"}`}>{titles[i]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="px-1 text-[11px] text-faint">← → to move between pages</p>
        </nav>

        {/* The notes */}
        <article className="card flex flex-col px-5 py-6 sm:px-10 sm:py-10">
          {pages.length === 0 && <p className="text-center text-muted">This file has no pages to study.</p>}
          {pages.map((p, i) => {
            const md = notes[p.pageNumber];
            return (
              <section
                key={p.pageNumber}
                id={`p-${p.pageNumber}`}
                data-study-page={p.pageNumber}
                aria-label={`Page ${p.pageNumber}`}
                className={`scroll-mt-28 lg:scroll-mt-24 ${i > 0 ? "mt-8 border-t border-dashed border-border pt-8" : ""}`}
              >
                <p className="mb-3 font-display text-[11px] tracking-[.2em] text-faint uppercase">
                  Page {p.pageNumber} of {total}
                </p>
                {md === undefined ? (
                  <div className="flex flex-col gap-3" aria-busy="true" aria-label={`Writing notes for page ${p.pageNumber}`}>
                    <div className={`${s.skeleton} h-7 w-1/2`} />
                    {Array.from({ length: 5 }, (_, k) => (
                      <div key={k} className={`${s.skeleton} h-4`} style={{ width: `${92 - ((k * 13 + i * 7) % 40)}%` }} />
                    ))}
                  </div>
                ) : md === null ? (
                  <div className={s.pageIn}>
                    <p className="mb-3 text-[13px] text-caution">
                      Couldn&apos;t tidy this page right now, so here&apos;s the text as parsed. Reload to try again.
                    </p>
                    <MarkdownView md={p.contentMd} />
                  </div>
                ) : md.trim() ? (
                  <div className={s.pageIn}>
                    <MarkdownView md={md} variant="notes" />
                  </div>
                ) : (
                  <p className="text-faint italic">This page has no text (it may be a picture or a diagram).</p>
                )}
              </section>
            );
          })}

          {pages.length > 0 && (
            <footer className="mt-10 flex flex-col items-center gap-4 border-t border-border pt-8 text-center">
              <p className="font-display text-lg text-text">End of the notes</p>
              {games.length > 0 ? (
                <>
                  <p className="text-[14px] text-muted">See what stuck: play a Game built from this file.</p>
                  <PractiseRow games={games} />
                </>
              ) : (
                <p className="text-[14px] text-muted">Make a Game from this file on the Module page to test yourself.</p>
              )}
              <Link href={`/modules/${mod.id}`} className="text-[14px] text-signal underline-offset-2 hover:underline">
                ← Back to {mod.name}
              </Link>
            </footer>
          )}
        </article>
      </div>
    </div>
  );
}

function PractiseRow({ games, label }: { games: Props["games"]; label?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 lg:justify-start">
      {label && <span className="font-display text-[11px] tracking-[.2em] text-faint uppercase">{label}</span>}
      {games.map((g) => {
        const ui = modeUi(g.mode);
        return (
          <Link
            key={g.id}
            href={`/games/${g.id}`}
            onClick={() => sfx.click()}
            className="inline-flex items-center gap-2 rounded-sm border bg-bg-2/70 px-3 py-1.5 text-[13px] text-text transition hover:-translate-y-0.5"
            style={{ borderColor: `color-mix(in srgb, ${ui.accent} 55%, transparent)` }}
          >
            <span aria-hidden="true" style={{ color: ui.accent }}>
              {ui.icon}
            </span>
            <span className="truncate">{g.title}</span>
            <span className="font-display text-[10px] tracking-[.15em] uppercase" style={{ color: ui.accent }}>
              {ui.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
