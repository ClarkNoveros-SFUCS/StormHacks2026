"use client";
// "Topic passed!" on a Reveal: shown when the Run was played on a Course Topic's Practice Game
// and met its Mode's pass bar. The Topic comes from F22 (`reveal.topic`); until that ships the
// Reveal has no topic and this renders nothing. Fires a pixel burst and the reward chime once.
import { useEffect, useRef } from "react";
import { burstFrom } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";

export type RevealTopic = { title?: string; name?: string; href?: string } | null | undefined;

/** Reads the optional F22 fields off any Reveal without depending on their final shape. */
export function revealTopic(reveal: unknown): RevealTopic {
  const t = (reveal as { topic?: unknown }).topic;
  return t && typeof t === "object" ? (t as RevealTopic) : null;
}

type Props = { passed: boolean; topic: RevealTopic; className?: string };

export function TopicPassBanner({ passed, topic, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const show = passed && !!topic;
  useEffect(() => {
    if (!show) return;
    const id = setTimeout(() => {
      burstFrom(ref.current, { count: 60, kind: "confetti" });
      sfx.reward();
    }, 900);
    return () => clearTimeout(id);
  }, [show]);
  if (!show) return null;
  const name = topic?.title ?? topic?.name;
  return (
    <div
      ref={ref}
      role="status"
      className={`flex items-center gap-3 rounded-[10px] px-4 py-3 ${className}`}
      style={{
        background: "color-mix(in srgb, var(--success, #3ddc97) 14%, transparent)",
        boxShadow: "inset 0 0 0 2px var(--success, #3ddc97), 0 0 24px color-mix(in srgb, var(--success, #3ddc97) 35%, transparent)",
        animation: "banner-in .6s var(--ease-snap) both",
      }}
    >
      <span aria-hidden="true" className="text-[26px]">
        ★
      </span>
      <span className="min-w-0">
        <b className="block font-display text-[20px] tracking-[0.06em] text-success uppercase">Topic passed!</b>
        {name && <span className="block truncate text-[14px] text-text">{name} · the next Topic is unlocked</span>}
      </span>
      {topic?.href && (
        <a href={topic.href} className="ml-auto shrink-0 text-[14px] font-semibold text-success underline-offset-2 hover:underline">
          Next ▸
        </a>
      )}
    </div>
  );
}
