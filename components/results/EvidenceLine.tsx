import Link from "next/link";
import type { Evidence } from "@/lib/runs/types";
import { PixelIcon } from "@/components/ui/PixelIcon";

type Props = {
  evidence: Evidence;
  /** Where the page reference links (the Module's file viewer, `?doc=&page=`). Plain text if omitted. */
  href?: string | null;
  className?: string;
};

/** `📄 Week 9 slides · p.41 — "…"` in Mulish. Renders nothing without Evidence. */
export function EvidenceLine({ evidence, href, className = "" }: Props) {
  if (!evidence) return null;
  const ref = `${evidence.documentTitle} · p.${evidence.pageNumber}`;
  return (
    <p className={`flex items-start gap-2 font-sans text-[13px] leading-snug text-muted ${className}`}>
      <PixelIcon name="doc" size={14} className="mt-0.5 shrink-0" />
      <span>
        {href ? (
          <Link href={href} className="text-text/85 underline decoration-signal/40 underline-offset-2 hover:text-signal hover:decoration-signal">
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
