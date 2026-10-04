import type { Evidence } from "@/lib/runs/types";
import { PixelIcon } from "@/components/ui/PixelIcon";

type Props = { evidence: Evidence; className?: string };

/** `📄 Week 9 slides · p.41 — "…"` in Mulish. Renders nothing without Evidence. */
export function EvidenceLine({ evidence, className = "" }: Props) {
  if (!evidence) return null;
  return (
    <p className={`flex items-start gap-2 font-sans text-[13px] leading-snug text-muted ${className}`}>
      <PixelIcon name="doc" size={14} className="mt-0.5 shrink-0" />
      <span>
        <span className="text-text/85">
          {evidence.documentTitle} · p.{evidence.pageNumber}
        </span>
        {evidence.quote && <span className="italic"> — “{evidence.quote}”</span>}
      </span>
    </p>
  );
}
