"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Chip, Mascot, ModeBadge, PixelIcon, burstFrom, celebrate, type MascotHandle } from "@/components/ui";
import type { ModeRecords } from "@/lib/courses/rules";
import type { TopicSummary } from "@/lib/courses/types";
import { prefersReducedMotion } from "@/lib/motion/reduced";
import { MODE_UI, type ModeUiId } from "@/lib/ui/modes";
import { sfx } from "@/lib/ui/sfx";
import s from "../explore.module.css";
import { bestLabel } from "../_lib/modes";

type NodeState = "passed" | "current" | "locked" | "open";

function nodeState(t: TopicSummary, currentSlug: string | null): NodeState {
  if (!t.progress) return "open";
  if (t.progress.passed) return "passed";
  if (t.progress.locked) return "locked";
  return t.slug === currentSlug ? "current" : "open";
}

type Props = {
  courseSlug: string;
  topics: TopicSummary[];
  /** Per-Topic, per-Mode records (signed in), keyed by Topic slug. */
  records: Record<string, ModeRecords>;
  /** `?passed=<topicSlug>`: replay that Topic's pass → next Topic unlock animation. */
  passedSlug: string | null;
};

/**
 * The numbered Topic timeline (Codedex-style): circled numbers on a vertical line. Passed Topics
 * get a gold check and fill the line below them; the current one pulses; locked ones show a padlock.
 * Each Topic is an accordion with its summary, Modes (your best and pass per Mode) and Read/Practice.
 * With `passedSlug`, the line below that Topic fills, the next node pops open and the mascot cheers.
 */
export function TopicTimeline({ courseSlug, topics, records, passedSlug }: Props) {
  const currentSlug = topics.find((t) => t.progress && !t.progress.locked && !t.progress.passed)?.slug ?? null;
  const passedIdx = passedSlug ? topics.findIndex((t) => t.slug === passedSlug && t.progress?.passed) : -1;
  const unlockIdx = passedIdx >= 0 && passedIdx + 1 < topics.length ? passedIdx + 1 : -1;
  const courseDone = passedIdx >= 0 && topics.every((t) => t.progress?.passed);

  const [open, setOpen] = useState<string | null>(() =>
    unlockIdx >= 0 ? topics[unlockIdx].slug : (currentSlug ?? (topics[0]?.progress ? null : topics[0]?.slug ?? null)),
  );
  // During the unlock animation the next node still shows its padlock until it pops.
  const [unlocking, setUnlocking] = useState(unlockIdx >= 0);
  const nodes = useRef<(HTMLSpanElement | null)[]>([]);
  const mascot = useRef<MascotHandle>(null);

  useEffect(() => {
    if (passedIdx < 0) return;
    // Drop ?passed so a refresh doesn't replay it.
    const url = new URL(window.location.href);
    url.searchParams.delete("passed");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    nodes.current[passedIdx]?.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => burstFrom(nodes.current[passedIdx], { kind: "spark", count: 18, colors: ["#ffd84d", "#fff"] }), 300));
    if (unlockIdx >= 0) {
      timers.push(
        setTimeout(() => {
          setUnlocking(false);
          sfx.reward();
          burstFrom(nodes.current[unlockIdx], { count: 34 });
          mascot.current?.react("happy");
          mascot.current?.say(`Topic ${topics[unlockIdx].number} unlocked!`, 4000);
        }, 1600),
      );
    }
    if (courseDone) {
      timers.push(
        setTimeout(() => {
          celebrate();
          mascot.current?.react("wow");
          mascot.current?.say("You finished the whole course!", 5000);
        }, 900),
      );
    }
    return () => timers.forEach(clearTimeout);
    // Run once on mount for this param.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <ol className="flex flex-col gap-3.5">
        {topics.map((t, i) => {
          let state = nodeState(t, currentSlug);
          if (i === unlockIdx && unlocking) state = "locked";
          const isOpen = open === t.slug;
          const last = i === topics.length - 1;
          const filled = !!t.progress?.passed;
          const recs = records[t.slug] ?? {};
          const locked = !!t.progress?.locked;
          return (
            <li key={t.slug} className="relative pl-[66px]">
              {!last && (
                <span aria-hidden="true" className={s.rail}>
                  {filled && <span className={`${s.railFill} ${i === passedIdx ? s.railFilling : ""}`} />}
                </span>
              )}
              <span
                ref={(el) => {
                  nodes.current[i] = el;
                }}
                className={`${s.node} ${i === unlockIdx ? `${s.nodePop} ${s.unlockGlow}` : ""}`}
                data-state={state}
                aria-hidden="true"
              >
                {state === "passed" ? (
                  <PixelIcon name="check" size={24} palette={{ g: "#1a1405" }} />
                ) : state === "locked" ? (
                  <PixelIcon name="lock" size={22} />
                ) : (
                  t.number
                )}
              </span>

              <div
                className={`card overflow-hidden ${state === "current" ? "border-signal/60" : ""} ${
                  state === "locked" ? "opacity-80" : ""
                }`}
              >
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`topic-${t.slug}`}
                    onClick={() => {
                      sfx.toggle();
                      setOpen(isOpen ? null : t.slug);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2/60 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 font-display text-[11px] tracking-[0.2em] text-faint uppercase">
                        Topic {t.number}
                        {state === "passed" && <Chip tone="reward">Passed</Chip>}
                        {state === "current" && <Chip tone="signal">Up next</Chip>}
                        {state === "locked" && <Chip tone="neutral">Locked</Chip>}
                        {t.progress?.read && <Chip tone="violet">Read</Chip>}
                      </span>
                      <span className="mt-1 block font-display text-lg leading-snug text-text sm:text-xl">{t.title}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden="true">
                      {t.modes.map((m) => (
                        <span key={m} className="text-sm" style={{ color: MODE_UI[m as ModeUiId]?.accent }} title={MODE_UI[m as ModeUiId]?.name}>
                          {MODE_UI[m as ModeUiId]?.icon}
                        </span>
                      ))}
                    </span>
                    {t.minutes !== null && <span className="hidden shrink-0 text-sm text-muted sm:inline">{t.minutes} min</span>}
                    <span className={`${s.chevron} shrink-0 font-display text-muted`} data-open={isOpen} aria-hidden="true">
                      ▾
                    </span>
                  </button>
                </h3>
                <div id={`topic-${t.slug}`} className={s.panel} data-open={isOpen} role="region" aria-label={`Topic ${t.number}: ${t.title}`}>
                  <div>
                    <div className="flex flex-col gap-4 border-t border-border px-4 pt-4 pb-5 sm:px-5">
                      <p className="text-muted">{t.summary}</p>
                      {t.modes.length > 0 && (
                        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Practice games">
                          {t.modes.map((m) => {
                            const r = recs[m];
                            return (
                              <li key={m} className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg-2/70 px-2.5 py-1.5">
                                {m in MODE_UI ? <ModeBadge mode={m as ModeUiId} /> : <span>{m}</span>}
                                <span className="flex items-center gap-1.5 text-sm text-muted tabular-nums">
                                  {t.progress ? (r ? `Best ${bestLabel(m, r.best)}` : "Not played") : null}
                                  {r?.passed && <PixelIcon name="check" size={14} title="Passed" />}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {locked && (
                        <p className="flex items-center gap-2 text-sm text-muted">
                          <PixelIcon name="lock" size={16} /> Pass Topic {t.number - 1} to unlock its practice games. The reading is open.
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3">
                        <Button href={`/explore/${courseSlug}/${t.slug}`} variant={locked || state === "passed" ? "secondary" : "primary"} size="sm" icon={<PixelIcon name="book" size={14} />}>
                          {t.progress?.read ? "Read again" : "Read"}
                        </Button>
                        {!locked && (
                          <Button href={`/explore/${courseSlug}/${t.slug}#practice`} variant="ghost" size="sm" icon={<PixelIcon name="target" size={14} />}>
                            Practice
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {passedIdx >= 0 && (
        <div className="pointer-events-none fixed right-4 bottom-4 z-50 sm:right-8 sm:bottom-8">
          <div className="pointer-events-auto" style={{ animation: "pop-in .5s var(--ease-snap) .2s both" }}>
            <Mascot ref={mascot} size={96} bubbleSide="left" say={unlockIdx < 0 && !courseDone ? "Topic passed!" : undefined} />
          </div>
        </div>
      )}
    </div>
  );
}
