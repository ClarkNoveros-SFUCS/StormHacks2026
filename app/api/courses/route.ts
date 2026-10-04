import { courseRoute } from "@/lib/courses/http";
import { listCourses } from "@/lib/courses/queries";

// Public (Q24): the Explore catalogue. Signed out, `progress` is null. → { courses: CourseSummary[] }
export async function GET() {
  return courseRoute("optional", async (playerId) => ({ courses: await listCourses(playerId) }));
}
