import { courseRoute } from "@/lib/courses/http";
import { markTopicRead } from "@/lib/courses/queries";

// "Mark as read" (Q27): +20 XP the first time, gates nothing. Idempotent. → TopicReadResponse
export async function POST(_req: Request, ctx: RouteContext<"/api/courses/[slug]/topics/[topicSlug]/read">) {
  const { slug, topicSlug } = await ctx.params;
  return courseRoute("required", (playerId) => markTopicRead(playerId!, slug, topicSlug));
}
