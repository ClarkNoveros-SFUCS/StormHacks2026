import { courseRoute } from "@/lib/courses/http";
import { getCourse } from "@/lib/courses/queries";

// Public (Q24): the Course page with its Topic timeline; lock/passed/read state when signed in.
// → { course: CourseDetail } | 404
export async function GET(_req: Request, ctx: RouteContext<"/api/courses/[slug]">) {
  const { slug } = await ctx.params;
  return courseRoute("optional", async (playerId) => {
    const course = await getCourse(slug, playerId);
    return course && { course };
  });
}
