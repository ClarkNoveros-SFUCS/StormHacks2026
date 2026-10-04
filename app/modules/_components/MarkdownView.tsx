import { Fragment, type ReactNode } from "react";
import { parseMarkdown, splitMatches, type Block, type Inline } from "../_lib/markdown";
import s from "./modules.module.css";

// Renders parsed markdown as React elements (never raw HTML), highlighting `query` matches.
// The "notes" variant (#75, Gemini's tidy study notes) sets code spans as formulas in the body
// font, since the pixel code font has no math glyphs.

const CODE_CLASS = {
  raw: "rounded-[3px] bg-bg-2 px-1 py-0.5 font-hud text-[17px] text-signal",
  notes: "rounded-[3px] bg-bg-2 px-1.5 py-0.5 font-sans text-[0.95em] font-semibold text-signal [box-decoration-break:clone]",
};
type Variant = keyof typeof CODE_CLASS;

function Text({ v, q }: { v: string; q: string }) {
  if (!q.trim()) return <>{v}</>;
  return (
    <>{splitMatches(v, q).map((p, i) => (p.hit ? <mark key={i}>{p.v}</mark> : <Fragment key={i}>{p.v}</Fragment>))}</>
  );
}

function Inlines({ c, q, v = "raw" }: { c: Inline[]; q: string; v?: Variant }): ReactNode {
  return c.map((n, i) => {
    switch (n.t) {
      case "text":
        return <Text key={i} v={n.v} q={q} />;
      case "code":
        return (
          <code key={i} className={CODE_CLASS[v]}>
            <Text v={n.v} q={q} />
          </code>
        );
      case "strong":
        return (
          <strong key={i} className="font-bold text-text">
            <Inlines c={n.c} q={q} v={v} />
          </strong>
        );
      case "em":
        return (
          <em key={i}>
            <Inlines c={n.c} q={q} v={v} />
          </em>
        );
      case "link":
        return (
          <a
            key={i}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-signal underline underline-offset-2"
          >
            <Inlines c={n.c} q={q} v={v} />
          </a>
        );
    }
  });
}

function Lines({ lines, q, v }: { lines: Inline[][]; q: string; v?: Variant }) {
  return lines.map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      <Inlines c={l} q={q} v={v} />
    </Fragment>
  ));
}

const H_CLASS = [
  "",
  "font-display text-2xl text-text mt-1",
  "font-display text-xl text-text mt-2",
  "font-display text-lg text-text mt-2",
  "font-display text-base text-text",
  "font-display text-base text-muted",
  "font-display text-sm text-muted",
];

function BlockView({ b, q, v }: { b: Block; q: string; v: Variant }) {
  switch (b.t) {
    case "h": {
      const H = `h${Math.min(6, b.level + 1)}` as "h2";
      return (
        <H className={H_CLASS[b.level]}>
          <Inlines c={b.c} q={q} v={v} />
        </H>
      );
    }
    case "p":
      return (
        <p>
          <Lines lines={b.lines} q={q} v={v} />
        </p>
      );
    case "list":
      return (
        <ul className="flex flex-col gap-1">
          {b.items.map((it, i) => (
            <li key={i} className="flex gap-2" style={{ paddingLeft: `${it.depth * 1.25}rem` }}>
              <span
                aria-hidden="true"
                className={`shrink-0 ${it.ordered ? "font-hud text-[17px] text-signal" : "text-accent"}`}
              >
                {it.ordered ? it.marker : it.depth > 0 ? "◦" : "▪"}
              </span>
              <span className="min-w-0">
                <Inlines c={it.c} q={q} v={v} />
              </span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="max-w-full overflow-x-auto rounded-sm border border-border">
          <table className="w-full border-collapse text-left text-[14px]">
            <thead className="bg-surface-2">
              <tr>
                {b.head.map((c, i) => (
                  <th key={i} className="border-b border-border px-3 py-2 font-display font-normal text-text">
                    <Inlines c={c} q={q} v={v} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="odd:bg-bg-2/40">
                  {r.map((c, j) => (
                    <td key={j} className="border-t border-border px-3 py-1.5 align-top">
                      <Inlines c={c} q={q} v={v} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="max-w-full overflow-x-auto rounded-sm border border-border bg-bg-2 p-3 font-hud text-[17px] leading-snug text-text">
          <code>
            <Text v={b.v} q={q} />
          </code>
        </pre>
      );
    case "quote":
      return (
        <blockquote className="border-l-2 border-violet pl-3 text-muted italic">
          <Lines lines={b.lines} q={q} v={v} />
        </blockquote>
      );
    case "notes":
      return (
        <aside className="rounded-sm border border-dashed border-border-strong bg-bg-2/60 p-3 text-[14px] text-muted">
          <p className="mb-1 font-display text-[11px] tracking-[.2em] text-faint uppercase">Speaker notes</p>
          <Lines lines={b.lines} q={q} v={v} />
        </aside>
      );
    case "hr":
      return <hr className="border-dashed border-border" />;
  }
}

export function MarkdownView({ md, query = "", variant = "raw" }: { md: string; query?: string; variant?: Variant }) {
  const blocks = parseMarkdown(md);
  if (blocks.length === 0) return <p className="text-faint italic">This page has no text.</p>;
  return (
    <div className={`${s.md} flex flex-col gap-3 font-sans text-[15px] leading-[1.6] break-words text-text/90`}>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} q={query} v={variant} />
      ))}
    </div>
  );
}
