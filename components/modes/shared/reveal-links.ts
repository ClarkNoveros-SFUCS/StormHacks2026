// Where a Reveal's links go, for every Mode. Course practice Games (F22, `reveal.topic`) belong
// to the system's Module, which Players can't open, so their Evidence links to the Topic reading
// and Back goes to the Topic page; every other Game links to the file's study page (#75).
import type { Evidence } from "@/lib/runs/types";
import { revealTopic } from "./TopicPassBanner";

export function revealLinks(reveal: object, context: { gameId: string; moduleId: string }) {
  const topic = revealTopic(reveal);
  const topicHref = topic?.courseSlug && topic.topicSlug ? `/explore/${topic.courseSlug}/${topic.topicSlug}` : null;
  return {
    topicHref,
    evidenceHref: (e: NonNullable<Evidence>) => topicHref ?? `/modules/${context.moduleId}/study/${e.documentId}?page=${e.pageNumber}`,
    backHref: topicHref ?? `/games/${context.gameId}`,
    backLabel: topicHref ? "Back to the Topic" : "Back to Game",
  };
}
