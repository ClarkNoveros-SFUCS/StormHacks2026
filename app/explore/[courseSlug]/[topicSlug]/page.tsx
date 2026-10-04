import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AskSonarButton } from "@/components/sonar/AskSonarButton";
import { Chip, PixelIcon } from "@/components/ui";
import { getTopic } from "@/lib/courses/queries";
import { badgeInfo } from "@/lib/social/badges";
import { ReadingView } from "../../_components/ReadingView";
import { JumpToPractice, MarkAsRead, PracticePanel, TopicPassedBanner } from "../../_components/TopicClient";
import { topicDetail, viewer } from "../../_lib/server";

export async function generateMetadata({ params }: PageProps<"/explore/[courseSlug]/[topicSlug]">): Promise<Metadata> {
  const { courseSlug, topicSlug } = await params;
  const topic = await getTopic(courseSlug, topicSlug, null);
  if (!topic) return { title: "Topic not found · SYLLABYSS" };
  const title = `${topic.title} · ${topic.course.title} Topic ${topic.number} · SYLLABYSS`;
  return {
    title,
    description: `${topic.summary} A short reading with examples and common mistakes, then practice games.`,
    openGraph: { title, description: topic.summary, type: "article" },
  };
}

// A Topic (reading public, Q24; playing needs sign-in): reading, resources, Mark as read, Practice.
export default async function TopicPage({ params }: PageProps<"/explore/[courseSlug]/[topicSlug]">) {
  const { courseSlug, topicSlug } = await params;
  const playerId = await viewer();
  const topic = await topicDetail(courseSlug, topicSlug, playerId);
  if (!topic) notFound();

  const p = topic.progress;
  const locked = !!p?.locked;
  const passed = !!p?.passed;
  const base = `/explore/${topic.course.slug}`;
  const badgeName = badgeInfo(topic.badgeId)?.name.replace(/^.*: /, "") ?? `Topic ${topic.number}`;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-20 sm:px-6" style={{ animation: "page-in .5s var(--ease-out) both" }}>
      <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
        <Link href="/explore" className="hover:text-signal">
          Explore
        </Link>
        <span aria-hidden="true" className="text-faint">
          /
        </span>
        <Link href={base} className="hover:text-signal">
          {topic.course.title}
        </Link>
        <span aria-hidden="true" className="text-faint">
          /
        </span>
        <span className="text-text">Topic {topic.number}</span>
      </nav>

      <header className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-xs tracking-[0.25em] text-signal uppercase">
            Topic {topic.number} of {topic.course.topicCount}
          </span>
          {passed && <Chip tone="reward">Passed</Chip>}
          {locked && <Chip icon={<PixelIcon name="lock" size={12} />}>Practice locked</Chip>}
          {p?.read && <Chip tone="violet">Read</Chip>}
        </div>
        <h1 className="text-[clamp(32px,5.5vw,52px)] leading-tight text-text">{topic.title}</h1>
        <p className="max-w-2xl text-[16px] text-muted">{topic.summary}</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted">
          {topic.minutes !== null && (
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="clock" size={15} /> {topic.minutes} min read
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <PixelIcon name="doc" size={15} /> {topic.reading.pages.length} pages
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PixelIcon name="cards" size={15} /> {topic.games.length} practice games
          </span>
          <JumpToPractice />
          {playerId && <AskSonarButton size="sm" message="How am I doing on this Topic?" />}
        </div>
        {passed && (
          <div className="mt-2">
            <TopicPassedBanner
              topicSlug={topic.slug}
              topicNumber={topic.number}
              badgeId={topic.badgeId}
              badgeName={badgeName}
              next={topic.next}
              courseSlug={topic.course.slug}
            />
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
        <article aria-label={`Reading: ${topic.title}`} className="min-w-0">
          <ReadingView pages={topic.reading.pages} />
          <MarkAsRead courseSlug={topic.course.slug} topicSlug={topic.slug} read={!!p?.read} signedIn={!!playerId} />
        </article>

        <div className="flex min-w-0 flex-col gap-6">
          <PracticePanel
            games={topic.games}
            signedIn={!!playerId}
            locked={locked}
            topicNumber={topic.number}
            next={topic.next}
            courseSlug={topic.course.slug}
            passed={passed}
          />

          {topic.resources.length > 0 && (
            <section aria-labelledby="resources" className="card p-5">
              <h2 id="resources" className="label-line mb-3">
                Learn more
              </h2>
              <ul className="flex flex-col gap-1">
                {topic.resources.map((r) => (
                  <li key={r.url}>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-2"
                    >
                      <PixelIcon name="book" size={18} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-text group-hover:text-signal">{r.title}</span>
                        {r.source && <span className="text-xs text-muted">{r.source}</span>}
                      </span>
                      <span aria-hidden="true" className="text-faint transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                        ↗
                      </span>
                      <span className="sr-only">(opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <nav aria-label="Topics" className="mt-10 grid gap-4 sm:grid-cols-2">
        {topic.prev ? (
          <Link href={`${base}/${topic.prev.slug}`} className="card group flex flex-col gap-1 p-4" data-interactive="true">
            <span className="text-xs text-muted">← Topic {topic.number - 1}</span>
            <span className="font-display text-lg text-text">{topic.prev.title}</span>
          </Link>
        ) : (
          <Link href={base} className="card group flex flex-col gap-1 p-4" data-interactive="true">
            <span className="text-xs text-muted">← Course</span>
            <span className="font-display text-lg text-text">{topic.course.title}</span>
          </Link>
        )}
        {topic.next ? (
          <Link
            href={`${base}/${topic.next.slug}`}
            className={`card group flex flex-col items-end gap-1 p-4 text-right ${passed ? "border-primary/60 shadow-[0_0_24px_-8px_var(--primary)]" : ""}`}
            data-interactive="true"
          >
            <span className={`text-xs ${passed ? "text-primary" : "text-muted"}`}>
              {passed ? "Unlocked · " : ""}Topic {topic.number + 1} →
            </span>
            <span className="font-display text-lg text-text">{topic.next.title}</span>
          </Link>
        ) : (
          <Link href={base} className="card group flex flex-col items-end gap-1 p-4 text-right" data-interactive="true">
            <span className="text-xs text-muted">Course →</span>
            <span className="font-display text-lg text-text">Back to {topic.course.title}</span>
          </Link>
        )}
      </nav>
    </main>
  );
}
