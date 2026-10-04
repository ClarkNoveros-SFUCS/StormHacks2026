"use client";
import Link from "next/link";
import type { Evidence } from "@/lib/runs/types";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { sfx } from "@/lib/ui/sfx";
import { useSlidePanel } from "./SlidePanel";

type Props = {
  evidence: Evidence;
  /** Where the page reference links (the Module's file viewer, `?doc=&page=`). Plain text if omitted. */
  href?: string | null;
  className?: string;
};

/**
 * `📄 Week 9 slides · p.41 — "…"` in Mulish. Renders nothing without Evidence. Inside a
 * SlidePanelProvider (the Reveal), a link into the Module opens the page in the slide panel
 * instead; a modified click (new tab) still follows the link.
 */
export function EvidenceLine({ evidence, href, className = "" }: Props) {
  const panel = useSlidePanel();
  if (!evidence) return null;
  const ref = `${evidence.documentTitle} · p.${evidence.pageNumber}`;
  const inPanel = !!panel && !!href?.startsWith("/modules/");
  return (
    <p className={`flex items-start gap-2 font-sans text-[13px] leading-snug text-muted ${className}`}>
      <PixelIcon name="doc" size={14} className="mt-0.5 shrink-0" />
      <span>
        {href ? (
          <Link
            href={href}
            onClick={(e) => {
              if (!inPanel || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation(); // the link sits inside expandable rows
              sfx.click();
              panel.open({ evidence, href });
            }}
            aria-haspopup={inPanel ? "dialog" : undefined}
            title={inPanel ? "Show this page beside the results" : undefined}
            className="text-text/85 underline decoration-signal/40 underline-offset-2 hover:text-signal hover:decoration-signal"
          >
            {ref}
          </Link>
        ) : (
          <span className="text-text/85">{ref}</span>
        )}
        {evidence.quote && <span className="italic"> — “{evidence.quote}”</span>}
      </span>
    </p>
  );
}
