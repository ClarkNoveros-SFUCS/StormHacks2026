import type { Metadata } from "next";
import { Mascot } from "@/components/ui";
import { ExploreHeroScene } from "./_components/art";
import { ComingSoonCard, CourseCard, MakeYourOwnCard, type ComingSoon } from "./_components/CatalogueCards";
import { Parallax } from "./_components/Parallax";
import { courseList, viewer } from "./_lib/server";

export const metadata: Metadata = {
  title: "Explore courses · SYLLABYSS",
  description:
    "Free, game-based learning paths. Read a short Topic, then pass a practice game (Dive, Apogee, Leap, Pairs or Blitz) to unlock the next one. Start with Python Basics.",
  openGraph: {
    title: "Explore courses · SYLLABYSS",
    description: "Learn something new: short readings, then games that make it stick. Start with Python Basics.",
    type: "website",
  },
};

// Placeholders for the catalogue (decision §5 CHECK): shown locked; clicking one wiggles it.
const COMING_SOON: ComingSoon[] = [
  { title: "SQL Basics", level: "Beginner", banner: "sql", blurb: "Ask a database questions with SELECT, WHERE and JOIN.", topics: 6 },
  { title: "Data Structures", level: "Intermediate", banner: "tree", blurb: "Lists, stacks, queues, trees and hash maps, and when to use each.", topics: 8 },
  { title: "Web Basics", level: "Beginner", banner: "web", blurb: "How pages are built: HTML structure, CSS style, a little JavaScript.", topics: 6 },
];

export default async function ExplorePage() {
  const playerId = await viewer();
  const courses = await courseList(playerId);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-20 sm:px-6" style={{ animation: "page-in .5s var(--ease-out) both" }}>
      {/* Hero */}
      <Parallax className="relative overflow-hidden rounded-lg border border-border shadow-[0_30px_60px_-30px_rgba(0,0,0,.9)]">
        <div className="absolute inset-0">
          <ExploreHeroScene />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-bg/60 to-bg/20 sm:bg-gradient-to-r sm:from-bg/85 sm:via-bg/45 sm:to-transparent" />
        <div className="relative flex min-h-[280px] flex-col justify-center gap-4 p-6 sm:min-h-[320px] sm:p-10">
          <span className="font-display text-xs tracking-[0.3em] text-signal uppercase">Explore</span>
          <h1 className="max-w-xl text-[clamp(34px,6vw,58px)] text-text [text-shadow:3px_3px_0_#05070f]">
            Learn something new
          </h1>
          <p className="max-w-lg text-[16px] text-text/85">
            Short readings, then games that make it stick. Pass any practice game to unlock the next Topic.
          </p>
        </div>
        <div className="pointer-events-none absolute right-4 bottom-2 hidden sm:block">
          <div className="pointer-events-auto animate-[float_6s_ease-in-out_infinite]">
            <Mascot size={112} say="Pick a path. I'll light the way!" bubbleSide="left" />
          </div>
        </div>
      </Parallax>

      {/* Courses */}
      <section aria-labelledby="courses" className="mt-12">
        <h2 id="courses" className="label-line mb-5">
          Courses
        </h2>
        {courses.length === 0 ? (
          <p className="card p-6 text-muted">No courses are published yet. Run <code>npm run db:seed:courses</code>.</p>
        ) : (
          <div className={`stagger grid gap-6 ${courses.length > 1 ? "md:grid-cols-2" : ""}`}>
            {courses.map((c, i) => (
              <div key={c.slug} style={{ "--i": i } as React.CSSProperties}>
                <CourseCard course={c} wide={courses.length === 1} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="soon" className="mt-12">
        <h2 id="soon" className="label-line mb-5">
          Coming soon
        </h2>
        <div className="stagger grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map((c, i) => (
            <div key={c.title} style={{ "--i": i } as React.CSSProperties}>
              <ComingSoonCard course={c} />
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Make your own" className="mt-12">
        <MakeYourOwnCard />
      </section>
    </main>
  );
}
