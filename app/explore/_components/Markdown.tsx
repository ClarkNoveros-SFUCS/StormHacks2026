"use client";
import { useState, type ReactNode } from "react";
import { PixelIcon } from "@/components/ui";
import { sfx } from "@/lib/ui/sfx";
import s from "../explore.module.css";
import type { Block, Inline } from "../_lib/markdown";
import { tokenizePython } from "../_lib/python-highlight";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        switch (n.type) {
          case "text":
            return <span key={i}>{n.text}</span>;
          case "code":
            return <code key={i}>{n.text}</code>;
          case "bold":
            return (
              <strong key={i}>
                <Inlines nodes={n.children} />
              </strong>
            );
          case "link":
            return (
              <a key={i} href={n.href} target="_blank" rel="noopener noreferrer">
                <Inlines nodes={n.children} />
              </a>
            );
        }
      })}
    </>
  );
}

/** A code block with a window bar, Python highlighting and a copy button. */
export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);
  const python = lang === "python" || lang === "py" || lang === "";
  const tokens = python ? tokenizePython(code) : [{ kind: "plain" as const, text: code }];
  return (
    <figure className={s.code}>
      <figcaption className={s.codeBar}>
        <span className={s.dot} style={{ background: "#ff5c5c" }} />
        <span className={s.dot} style={{ background: "#ffd84d" }} />
        <span className={s.dot} style={{ background: "#3ddc97" }} />
        <span className="ml-2 flex-1">{lang || "python"}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              sfx.pop();
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard blocked: ignore */
            }
          }}
          className="rounded-sm px-1.5 py-0.5 text-faint transition-colors hover:bg-surface-2 hover:text-signal"
          aria-label="Copy code"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </figcaption>
      <pre>
        <code>
          {tokens.map((t, i) =>
            t.kind === "plain" ? t.text : (
              <span key={i} className={s[`tk-${t.kind}`]}>
                {t.text}
              </span>
            ),
          )}
        </code>
      </pre>
    </figure>
  );
}

function Callout({ block }: { block: Extract<Block, { type: "quote" }> }) {
  const mistakes = block.variant === "mistakes";
  return (
    <aside className={s.callout} style={{ "--c": mistakes ? "var(--caution)" : "var(--signal)" } as React.CSSProperties}>
      {block.title && (
        <p className="!mt-0 !mb-1 flex items-center gap-2 font-display text-[15px] tracking-wide" style={{ color: "var(--c)" }}>
          <PixelIcon name={mistakes ? "cross" : "bubble"} size={18} />
          {block.title}
        </p>
      )}
      <Blocks blocks={block.blocks} />
    </aside>
  );
}

/** Renders parsed reading blocks. Page headings (#) become h2 under the page's h1. */
export function Blocks({ blocks, idFor }: { blocks: Block[]; idFor?: (text: string) => string }) {
  const out: ReactNode[] = blocks.map((b, i) => {
    switch (b.type) {
      case "heading": {
        const level = Math.min(4, b.level + 1);
        const id = idFor?.(b.text);
        const content = <Inlines nodes={b.children} />;
        if (level === 2) return <h2 key={i} id={id}>{content}</h2>;
        if (level === 3) return <h3 key={i} id={id}>{content}</h3>;
        return <h4 key={i} id={id}>{content}</h4>;
      }
      case "paragraph":
        return (
          <p key={i}>
            <Inlines nodes={b.children} />
          </p>
        );
      case "code":
        return <CodeBlock key={i} code={b.code} lang={b.lang} />;
      case "list": {
        const items = b.items.map((it, j) => (
          <li key={j}>
            <Inlines nodes={it} />
          </li>
        ));
        return b.ordered ? (
          <ol key={i} start={b.start}>
            {items}
          </ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      }
      case "quote":
        return <Callout key={i} block={b} />;
    }
  });
  return <>{out}</>;
}
