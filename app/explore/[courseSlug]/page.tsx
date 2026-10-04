import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, ModeBadge, PixelIcon } from "@/components/ui";
import { getCourse } from "@/lib/courses/queries";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { CourseArt } from "../_components/art";
import { CourseSidebar } from "../_components/CourseSidebar";
import { Parallax } from "../_components/Parallax";
import { SignInCta } from "../_components/SignInCta";
import { TopicTimeline } from "../_components/TopicTimeline";
import { courseDetail, resourceCount, topicRecords, viewer, viewerCard } from "../_lib/server";

export async function generateMetadata({ params }: PageProps<"/explore/[courseSlug]">): Promise<Metadata> {
  const { courseSlug } = await params;
  const course = await getCourse(courseSlug, null);
  if (!course) return { title: "Course not found · SYLLABYSS" };
  const title = `${course.title} · ${course.level} course · SYLLABYSS`;
  return {
    title,
    description: `${course.summary} ${course.topicCount} Topics, about ${course.minutes} minutes of reading, each with practice games.`,
    openGraph: { title, description: course.summary, type: "website" },
  };
}

// The Course page (public, Q24): banner hero, numbered Topic timeline, sidebar.
// `?passed=<topicSlug>` replays the Topic pass → next Topic unlock animation (Reveal links here).
export default async function CoursePage({ params, searchParams }: PageProps<"/explore/[courseSlug]">) {
  const { courseSlug } = await params;
  const { passed } = await searchParams;
  const playerId = await viewer();
  const course = await courseDetail(courseSlug, playerId);
  if (!course) notFound();
  const [records, resources, card] = await Promise.all([
    topicRecords(courseSlug, playerId),
    resourceCount(courseSlug),
    viewerCard(playerId),
  ]);

  const p = course.progress;
  const first = course.topics[0];
  const next = p?.nextTopicSlug ? course.topics.find((t) => t.slug === p.nextTopicSlug) : null;
  const started = !!p && (p.passed > 0 || course.topics.some((t) => t.progress?.read));
  const cta = !p
    ? { href: `/explore/${course.slug}/${first?.slug}`, label: "Start learning" }
    : p.finished
      ? { href: `/explore/${course.slug}/${first?.slug}`, label: "Review the course" }
      : next && started
        ? { href: `/explore/${course.slug}/${next.slug}`, label: `Continue: Topic ${next.number}` }
        : { href: `/explore/${course.slug}/${(next ?? first)?.slug}`, label: "Start learning" };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-20 sm:px-6" style={{ animation: "page-in .5s var(--ease-out) both" }}>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/explore" className="hover:text-signal">
          Explore
        </Link>
        <span aria-hidden="true" className="mx-2 text-faint">
          /
        </span>
        <span className="text-text">{course.title}</span>
      </nav>

      {/* Banner hero */}
      <Parallax className="relative overflow-hidden rounded-lg border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
        {/* Mirrored so the python slithers on the right, clear of the title. */}
        <div className="absolute inset-0 -scale-x-100">
          <CourseArt banner={course.banner} title={`${course.title} banner: a pixel python in a jungle`} />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-bg/95 via-bg/75 to-bg/30 sm:bg-gradient-to-r sm:from-bg/90 sm:via-bg/60 sm:to-bg/5" />
        <div className="relative flex min-h-[340px] flex-col justify-end gap-4 p-6 sm:p-10">
          <span className="w-fit rounded-sm bg-[#05070fcc] px-2.5 py-1 font-display text-xs tracking-[0.2em] text-reward uppercase ring-1 ring-reward/40">
            {course.level} · Course
          </span>
          <h1 className="text-[clamp(38px,7vw,68px)] leading-none text-text [text-shadow:3px_3px_0_#05070f]">{course.title}</h1>
          <p className="max-w-2xl text-[16px] text-text/85">{course.description}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button href={cta.href} variant="primary" size="lg" iconRight={<span>→</span>}>
              {cta.label}
            </Button>
            {!playerId && <SignInCta variant="secondary" size="lg" label="Sign in to track progress" />}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-text/80">
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="clock" size={16} /> About {course.minutes} min reading
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="book" size={16} /> {course.topicCount} Topics
            </span>
            <span className="flex flex-wrap gap-1.5">
              {course.modes.map((m) => (m in MODE_UI ? <ModeBadge key={m} mode={m as ModeUiId} /> : null))}
            </span>
          </div>
        </div>
      </Parallax>

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="topics">
          <h2 id="topics" className="label-line mb-2">
            Topics
          </h2>
          <p className="mb-5 text-sm text-muted">
            Read a Topic, then pass any one of its practice games to unlock the next. Practice is open as soon as a Topic unlocks.
          </p>
          <TopicTimeline
            courseSlug={course.slug}
            topics={course.topics}
            records={records}
            passedSlug={typeof passed === "string" ? passed : null}
          />
        </section>
        <CourseSidebar course={course} card={card} signedIn={!!playerId} resources={resources} />
      </div>
    </main>
  );
}
