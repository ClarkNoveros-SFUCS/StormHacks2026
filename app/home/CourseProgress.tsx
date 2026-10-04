import Link from "next/link";
import { ProgressBar } from "@/components/ui";
import type { CourseSummary } from "@/lib/courses/types";

/**
 * "Python Basics · 2 of 6 Topics" with a bar and a Continue link to the next unlocked Topic.
 * Server-rendered from F22's `listCourses` (the same data as `GET /api/courses`).
 */
export function CourseProgress({ course }: { course: CourseSummary }) {
  const p = course.progress ?? { passed: 0, total: course.topicCount, finished: false, nextTopicSlug: null };
  const href = p.nextTopicSlug ? `/explore/${course.slug}/${p.nextTopicSlug}` : `/explore/${course.slug}`;
  return (
    <Link href={href} className="card flex flex-col gap-3 bg-surface/95 p-4" data-interactive="true">
      <p className="font-display text-xs tracking-[0.2em] text-faint uppercase">
        {course.level} course · {course.topicCount} Topics
      </p>
      <h3 className="text-lg text-text">{course.title}</h3>
      <ProgressBar value={p.passed} max={Math.max(1, p.total)} tone="var(--success)" label={`${p.passed} of ${p.total} Topics passed`} height={8} />
      <span className="font-display text-sm text-signal">
        {p.finished ? "Review the course →" : p.passed === 0 ? "Start Topic 1 →" : "Next Topic →"}
      </span>
    </Link>
  );
}
