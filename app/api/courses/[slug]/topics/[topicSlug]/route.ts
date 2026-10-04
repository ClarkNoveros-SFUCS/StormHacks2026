import { courseRoute } from "@/lib/courses/http";
import { getTopic } from "@/lib/courses/queries";

// Public (Q24): the Topic page: reading pages, resources, practice Games per Mode with their
// pass bars, and (signed in) the caller's best per Mode, lock, passed and read state.
// → { topic: TopicDetail } | 404
export async function GET(_req: Request, ctx: RouteContext<"/api/courses/[slug]/topics/[topicSlug]">) {
  const { slug, topicSlug } = await ctx.params;
  return courseRoute("optional", async (playerId) => {
    const topic = await getTopic(slug, topicSlug, playerId);
    return topic && { topic };
  });
}
