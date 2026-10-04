"use client";
import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { useToast } from "@/components/ui/Toast";
import { burstFrom } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";

type Props = {
  /** Ready-made share text (lib/daily/share.ts). */
  text: string;
  /** "site": the yellow pixel button · "dive": the VT323 two-ring button of the Dive screens. */
  look?: "site" | "dive";
  label?: string;
  className?: string;
  style?: CSSProperties;
};

/** Copy text to the clipboard, falling back to a hidden textarea where the async API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      // Some browsers leave the promise pending (unfocused or background tab): don't hang the button.
      const ok = await Promise.race([
        navigator.clipboard.writeText(text).then(() => true),
        new Promise<false>((r) => setTimeout(() => r(false), 1200)),
      ]);
      if (ok) return true;
    }
  } catch {
    // fall through
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** SHARE: copies the Wordle-style share text and confirms with a toast and a little burst. */
export function ShareButton({ text, look = "site", label = "Share", className = "", style }: Props) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const onClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = e.currentTarget;
    const ok = await copyText(text);
    if (ok) {
      sfx.pop();
      burstFrom(el, { count: 14 });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast({ title: "Copied your dive", body: "Paste it anywhere. No answers spoiled.", tone: "success", icon: "check" });
    } else {
      sfx.error();
      toast({ title: "Couldn't copy", body: text, tone: "danger", ms: 8000 });
    }
  };

  if (look === "dive") {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-6 py-2.5 font-hud text-[20px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] ${className}`}
        style={{
          background: "color-mix(in srgb, var(--signal) 18%, #06121c)",
          boxShadow: "inset 0 0 0 2px var(--signal), 0 0 16px color-mix(in srgb, var(--signal) 30%, transparent), 0 4px 0 #0b3140",
          ...style,
        }}
      >
        {copied ? "✓ COPIED" : `⧉ ${label.toUpperCase()}`}
      </button>
    );
  }
  return (
    <Button variant="secondary" onClick={onClick} icon={<PixelIcon name={copied ? "check" : "users"} size={16} />} className={className} style={style}>
      {copied ? "Copied!" : label}
    </Button>
  );
}
