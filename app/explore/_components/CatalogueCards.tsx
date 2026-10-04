"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Chip, ModeBadge, PixelIcon, TiltCard } from "@/components/ui";
import type { CourseSummary } from "@/lib/courses/types";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import s from "../explore.module.css";
import { CourseArt } from "./art";
import { ProgressRing } from "./ProgressRing";

function LevelChip({ level }: { level: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm bg-[#05070fcc] px-2 py-1 font-display text-[11px] tracking-[0.18em] text-reward uppercase ring-1 ring-reward/40">
      {level} · Course
    </span>
  );
}

/** A Course in the catalogue: tilting card with its pixel banner, stats, Modes and your progress. */
export function CourseCard({ course, wide }: { course: CourseSummary; wide?: boolean }) {
  const p = course.progress;
  const cta = !p || p.passed === 0 ? "Start learning" : p.finished ? "Completed · review" : "Continue";
  return (
    <Link
      href={`/explore/${course.slug}`}
      className="group block rounded-md"
      onMouseEnter={() => sfx.hover()}
      onClick={() => sfx.click()}
      aria-label={`${course.title}: ${course.summary}`}
    >
      <TiltCard className="h-full" max={wide ? 4 : 8}>
        <div className={wide ? "md:grid md:grid-cols-[1.25fr_1fr]" : ""}>
        <div
          className={`relative h-40 overflow-hidden border-b border-border sm:h-44 ${
            wide ? "md:h-full md:min-h-[300px] md:border-r md:border-b-0" : ""
          }`}
        >
          <CourseArt banner={course.banner} className="transition-transform duration-700 group-hover:scale-[1.04]" />
          <div className="absolute top-3 left-3">
            <LevelChip level={course.level} />
          </div>
          {p && (
            <div className="absolute right-3 bottom-3">
              <ProgressRing value={p.passed} max={p.total} size={58} />
            </div>
          )}
        </div>
        <div className={`flex flex-col gap-3 p-5 ${wide ? "md:justify-center md:p-8" : ""}`}>
          <h3 className={`text-text ${wide ? "text-2xl md:text-4xl" : "text-2xl"}`}>{course.title}</h3>
          <p className="text-[15px] text-muted">{course.summary}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="book" size={16} /> {course.topicCount} Topics
            </span>
            <span className="inline-flex items-center gap-1.5">
              <PixelIcon name="clock" size={16} /> {course.minutes} min reading
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {course.modes.map((m) => (m in MODE_UI ? <ModeBadge key={m} mode={m as ModeUiId} /> : null))}
          </div>
          <span className="mt-1 inline-flex items-center gap-2 font-display text-primary">
            {cta}
            <span aria-hidden="true" className="transition-transform duration-300 group-hover:translate-x-1.5">
              →
            </span>
          </span>
        </div>
        </div>
      </TiltCard>
    </Link>
  );
}

export type ComingSoon = { title: string; level: string; banner: string; blurb: string; topics: number };

const QUIPS = ["Still being written!", "Soon. Very soon.", "Locked tight. For now.", "My lantern's on it."];

/** A locked "coming soon" Course. Clicking it wiggles the card and shows a quip. */
export function ComingSoonCard({ course }: { course: ComingSoon }) {
  const [shake, setShake] = useState(0);
  const quip = useRef(0);
  const [say, setSay] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const poke = () => {
    sfx.error();
    setShake((n) => n + 1);
    setSay(QUIPS[quip.current++ % QUIPS.length]);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSay(null), 1800);
  };
  return (
    <button
      type="button"
      onClick={poke}
      aria-label={`${course.title}: coming soon`}
      className="group relative block w-full text-left"
    >
      <div key={shake} className={`card relative h-full overflow-hidden ${shake ? s.wiggle : ""}`}>
        <div className="relative h-32 overflow-hidden border-b border-border grayscale-[.55] transition duration-500 group-hover:grayscale-0">
          <CourseArt banner={course.banner} />
          <div className="absolute inset-0 grid place-items-center bg-bg/45">
            <span className="flex flex-col items-center gap-1">
              <PixelIcon name="lock" size={30} />
              <span className="font-display text-xs tracking-[0.25em] text-text">COMING SOON</span>
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 p-4">
          <span className="font-display text-[11px] tracking-[0.18em] text-faint uppercase">{course.level} · Course</span>
          <h3 className="text-lg text-text">{course.title}</h3>
          <p className="text-sm text-muted">{course.blurb}</p>
          <span className="text-xs text-faint">{course.topics} Topics planned</span>
        </div>
      </div>
      {say && (
        <span
          role="status"
          className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-md border border-border-strong bg-surface-2 px-3 py-1.5 font-display text-sm whitespace-nowrap text-text shadow-xl"
          style={{ animation: "pop-in .35s var(--ease-snap) both" }}
        >
          {say}
        </span>
      )}
    </button>
  );
}

/** "Or make your own": links to Modules (upload your notes, get Games). */
export function MakeYourOwnCard({ children }: { children?: ReactNode }) {
  return (
    <Link
      href="/modules"
      onMouseEnter={() => sfx.hover()}
      onClick={() => sfx.click()}
      className="card group flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center"
      data-interactive="true"
    >
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-md border border-dashed border-border-strong bg-bg-2 transition-transform duration-300 group-hover:-rotate-6">
        <PixelIcon name="doc" size={34} />
      </span>
      <span className="flex-1">
        <span className="block font-display text-xl text-text">Or make your own</span>
        <span className="block text-muted">
          Upload your lecture slides or notes and SYLLABYSS turns them into Games: Dive, Apogee, Leap, Pairs and Blitz.
        </span>
        {children}
      </span>
      <Chip tone="signal" size="md">
        Upload your notes →
      </Chip>
    </Link>
  );
}
