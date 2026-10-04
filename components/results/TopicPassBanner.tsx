"use client";
// "Topic passed!" on a Reveal (F24's entry point). The banner itself lives in
// components/modes/shared/TopicPassBanner.tsx (F25), which reads F22's `reveal.topic` shape
// (`topicTitle`, `passedNow`, `unlockedNext`, links to the Topic and the Course unlock replay).
// This wrapper keeps the `passed` prop the Apogee and Leap Reveals pass.
import { revealTopic as readTopic, TopicPassBanner as Banner, type TopicLike } from "@/components/modes/shared/TopicPassBanner";

export type RevealTopic = TopicLike | null;

export function revealTopic(reveal: object): RevealTopic {
  return readTopic(reveal);
}

type Props = { passed: boolean; topic: RevealTopic; className?: string };

export function TopicPassBanner({ passed, topic, className = "" }: Props) {
  if (!passed || !topic) return null;
  return <Banner topic={topic} className={className} />;
}
