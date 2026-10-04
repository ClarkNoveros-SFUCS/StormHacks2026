"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProgressBar } from "@/components/ui";

// TODO(F22 #35): the Courses backend isn't merged yet. When it lands, point COURSE_API at its
// progress route and tighten `parse` to its response type. Until then the request 404s and
// this card stays hidden.
const COURSE_SLUG = "python-basics";
const COURSE_API = `/api/courses/${COURSE_SLUG}`;

type Progress = { title: string; passed: number; total: number };

/** Reads a few likely shapes ({ course: { title, topics[] } }, { progress: { passed, total } }, …). */
function parse(body: unknown): Progress | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const course = (b.course ?? b) as Record<string, unknown>;
  const title = typeof course.title === "string" ? course.title : "Python Basics";
  const prog = (b.progress ?? course.progress ?? course) as Record<string, unknown>;
  const topics = Array.isArray(course.topics) ? (course.topics as Record<string, unknown>[]) : null;
  const total = typeof prog.total === "number" ? prog.total : typeof prog.topicCount === "number" ? prog.topicCount : topics?.length;
  const passed =
    typeof prog.passed === "number"
      ? prog.passed
      : typeof prog.topicsPassed === "number"
        ? prog.topicsPassed
        : topics?.filter((t) => t.passed === true || typeof t.passedAt === "string").length;
  if (typeof total !== "number" || typeof passed !== "number" || total <= 0) return null;
  return { title, passed, total };
}

/** "Python Basics · 2 of 6 Topics" with a bar, once F22's API exists. Hidden on any error. */
export function CourseProgress() {
  const [p, setP] = useState<Progress | null>(null);
  useEffect(() => {
    let live = true;
    fetch(COURSE_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (live) setP(parse(body));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!p) return null;
  return (
    <Link href={`/explore/${COURSE_SLUG}`} className="card flex flex-col gap-3 bg-surface/95 p-4" data-interactive="true">
      <p className="font-display text-xs tracking-[0.2em] text-faint uppercase">Course</p>
      <h3 className="text-lg text-text">{p.title}</h3>
      <ProgressBar value={p.passed} max={p.total} tone="var(--success)" label={`${p.passed} of ${p.total} Topics passed`} height={8} />
      <span className="font-display text-sm text-signal">{p.passed >= p.total ? "Review the course →" : "Next Topic →"}</span>
    </Link>
  );
}
