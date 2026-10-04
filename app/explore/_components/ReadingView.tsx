"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/reduced";
import s from "../explore.module.css";
import { pageTitle, parseMarkdown, slugify } from "../_lib/markdown";
import { Blocks } from "./Markdown";

type Props = { pages: { pageNumber: number; contentMd: string }[] };

/**
 * The reading as one continuous article: a page index (pills that track where you are), every
 * page as a section ("Page n" matches the page numbers practice Evidence cites), and a reading
 * progress bar pinned to the top of the window.
 */
export function ReadingView({ pages }: Props) {
  const parsed = useMemo(
    () =>
      pages.map((p) => {
        const blocks = parseMarkdown(p.contentMd);
        const title = pageTitle(blocks, `Page ${p.pageNumber}`);
        return { ...p, blocks, title, id: `p${p.pageNumber}-${slugify(title)}` };
      }),
    [pages],
  );
  const article = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(parsed[0]?.id ?? "");
  const reduced = useReducedMotion();

  // Reading progress: how far the article has scrolled past the top of the viewport.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = article.current;
        if (!el || !bar.current) return;
        const r = el.getBoundingClientRect();
        const total = r.height - window.innerHeight * 0.6;
        const pct = Math.max(0, Math.min(1, -r.top / Math.max(1, total)));
        bar.current.style.transform = `scaleX(${pct})`;
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // Scroll-spy for the page pills.
  useEffect(() => {
    const els = parsed.map((p) => document.getElementById(p.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [parsed]);

  return (
    <div ref={article}>
      <div className={s.progressTrack} aria-hidden="true">
        <div ref={bar} className={s.progressFill} style={{ transform: "scaleX(0)" }} />
      </div>

      {parsed.length > 1 && (
        <nav aria-label="Reading pages" className="mb-6 flex flex-wrap gap-2">
          {parsed.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(p.id)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
                history.replaceState(history.state, "", `#${p.id}`);
              }}
              aria-current={active === p.id ? "true" : undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                active === p.id ? "border-signal bg-signal/10 text-text" : "border-border bg-surface/70 text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              <span className="font-display text-xs text-signal">{p.pageNumber}</span>
              {p.title}
            </a>
          ))}
        </nav>
      )}

      <div className={s.prose}>
        {parsed.map((p) => (
          <section key={p.id} aria-label={`Page ${p.pageNumber}: ${p.title}`} className="card mb-6 p-5 sm:p-8">
            <p className="!mt-0 !mb-2 font-display text-[11px] tracking-[0.25em] text-faint uppercase">Page {p.pageNumber}</p>
            <Blocks blocks={p.blocks} idFor={(text) => (text === p.title ? p.id : `${p.id}-${slugify(text)}`)} />
          </section>
        ))}
      </div>
    </div>
  );
}
