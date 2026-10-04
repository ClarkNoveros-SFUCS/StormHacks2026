import { PixelIcon } from "@/components/ui/PixelIcon";
import { fileKind } from "../_lib/files";

// The pixel doc icon, tinted by file type, with a tiny type tag so it's never colour alone.
const TINT = {
  pdf: { s: "#ff8a8a", S: "#c23b3b", tag: "PDF" },
  pptx: { s: "#ffc38a", S: "#d0661f", tag: "PPT" },
  docx: { s: "#9cc8ff", S: "#2d5fd6", tag: "DOC" },
  other: { s: "#d6deef", S: "#8d98b5", tag: "" },
} as const;

export function DocIcon({ filename, size = 22, className = "" }: { filename: string; size?: number; className?: string }) {
  const t = TINT[fileKind(filename)];
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} aria-hidden="true">
      <PixelIcon name="doc" size={size} palette={{ s: t.s, S: t.S }} />
      {t.tag && (
        <span
          className="absolute -right-2 -bottom-1 rounded-[2px] px-[3px] font-hud text-[11px] leading-[12px] text-[#0b0e1d]"
          style={{ background: t.s }}
        >
          {t.tag}
        </span>
      )}
    </span>
  );
}
