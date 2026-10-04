"use client";
// "Topic passed!" for a Reveal on a Course Topic's practice Game. F22 (#48) adds `topic` to every
// Reveal; until that lands it's simply absent, so it's read structurally here.
import Link from "next/link";
import { useEffect, useRef } from "react";
import { burstFrom, confettiRain } from "@/lib/motion/particles";
import { sfx } from "@/lib/ui/sfx";

/** The parts of F22's `TopicReveal` this banner uses. */
export type TopicLike = {
  courseSlug?: string;
  courseTitle?: string;
  topicSlug?: string;
  topicNumber?: number;
  topicTitle?: string;
  passed?: boolean;
  passedNow?: boolean;
  unlockedNext?: boolean;
  nextTopicSlug?: string | null;
  courseFinished?: boolean;
};

/** `reveal.topic` if the Reveal carries one (F22), else null. */
export function revealTopic(reveal: object): TopicLike | null {
  const t = (reveal as { topic?: TopicLike | null }).topic;
  return t && typeof t === "object" ? t : null;
}

/** A pixel banner with a confetti burst. Renders nothing unless the Topic's pass bar was met. */
export function TopicPassBanner({ topic, className = "" }: { topic: TopicLike | null; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const passed = !!topic?.passed;
  const fresh = !!topic?.passedNow;

  useEffect(() => {
    if (!passed) return;
    const id = setTimeout(() => {
      burstFrom(ref.current, { count: 60, spread: 520 });
      if (fresh) {
        confettiRain(120);
        sfx.levelUp();
      } else sfx.reward();
    }, 900);
    return () => clearTimeout(id);
  }, [passed, fresh]);

  if (!topic || !passed) return null;
  const topicHref = topic.courseSlug && topic.topicSlug ? `/explore/${topic.courseSlug}/${topic.topicSlug}` : null;
  const nextHref = topic.courseSlug && topic.nextTopicSlug ? `/explore/${topic.courseSlug}/${topic.nextTopicSlug}` : null;

  return (
    <div
      ref={ref}
      role="status"
      className={`relative w-full overflow-hidden px-5 py-4 text-center ${className}`}
      style={{
        background: "linear-gradient(180deg, color-mix(in srgb, var(--reward) 22%, var(--surface)), var(--surface))",
        boxShadow: "inset 0 0 0 3px var(--reward), 0 0 28px color-mix(in srgb, var(--reward) 35%, transparent), 0 6px 0 var(--ink)",
        animation: "banner-in .7s var(--ease-snap) .5s both, gold-breathe 3s ease-in-out 1.2s infinite",
      }}
    >
      <p className="font-display text-[28px] leading-none tracking-wide text-reward sm:text-[34px]">★ TOPIC PASSED! ★</p>
      <p className="mt-2 font-sans text-[14px] text-text">
        {topic.topicNumber ? `Topic ${topic.topicNumber} · ` : ""}
        {topic.topicTitle ?? "This Topic"}
        {topic.courseTitle ? <span className="text-muted"> · {topic.courseTitle}</span> : null}
      </p>
      {topic.courseFinished ? (
        <p className="mt-1 font-hud text-[20px] tracking-[0.2em] text-success">COURSE COMPLETE</p>
      ) : topic.unlockedNext ? (
        <p className="mt-1 font-hud text-[20px] tracking-[0.2em] text-success">NEXT TOPIC UNLOCKED ▶</p>
      ) : null}
      {(topicHref || nextHref) && (
        <div className="mt-2 flex flex-wrap justify-center gap-4 font-sans text-[14px]">
          {topicHref && (
            <Link href={topicHref} className="text-muted underline underline-offset-4 hover:text-text">
              Back to the Topic
            </Link>
          )}
          {nextHref && !topic.courseFinished && (
            <Link href={nextHref} className="text-reward underline underline-offset-4 hover:text-text">
              Next Topic ▶
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
