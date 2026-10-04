"use client";
// The Leap Run screen (/runs/[runId] for a Leap Game): 10 multiple-choice questions on floating
// sky islands. Flow (docs/architecture/run-and-scoring.md § Leap):
//   intro / "Ready? JUMP" → POST start-prompt (the question appears only now) → pick A–D (keys
//   1–4 or A–D; one answer) or the 50/50 → correct: the hopper leaps to the next island, points and
//   streak pop; wrong or time out: the island crumbles, a heart breaks, the hopper wobbles back
//   (at 0 hearts it falls: YOU FELL) → the result names the right option with its explanation →
//   "Ready? JUMP" for the next … → after 10: the summit flag → CLIMB REPORT.
// The server owns the clock and the score. Spec: docs/design/modes/leap.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import { LEAP_QUESTION_MS, streakMultiplier } from "@/lib/modes/leap/rules";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { LeapAnswerResponse, LeapOptionId, LeapRunState, PromptOutcome } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { LeapStage, type LeapStageHandle } from "./LeapStage";
import "./leap.css";

type Phase = "intro" | "ready" | "starting" | "play" | "result" | "ending";
type Square = "right" | "miss" | undefined;
type Result =
  | { kind: "right"; points: number; multiplier: number; speedBonus: number; halved: boolean; explanation: string | null }
  | { kind: "wrong"; explanation: string | null }
  | { kind: "timeout" };

type Props = {
  initial: LeapRunState;
  context: {
    runId: string;
    gameId: string;
    gameTitle: string;
    closed: { position: number; outcome: PromptOutcome; points: number }[];
  };
};

const KEYS: LeapOptionId[] = ["A", "B", "C", "D"];

export function LeapRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const total = initial.promptCount;
  const stage = useRef<LeapStageHandle>(null);
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(1);
  const timeoutBusy = useRef(false);
  const popRef = useRef<HTMLDivElement>(null);
  const popUntil = useRef(0);
  const nextBtn = useRef<HTMLButtonElement>(null);

  // Where the hopper stands after a reload: the last island it reached; missed islands are gone.
  const [startPlatform] = useState(() => context.closed.filter((c) => c.outcome === "correct").reduce((m, c) => Math.max(m, c.position), 0));
  const [startCrumbled] = useState(() => context.closed.filter((c) => c.outcome !== "correct").map((c) => c.position));

  const fresh = initial.position === 1 && !initial.startedAt && context.closed.length === 0;
  const startPhase: Phase = initial.question ? "play" : fresh ? "intro" : "ready";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const posRef = useRef(initial.position);
  const [run, setRun] = useState(initial);
  const [squares, setSquares] = useState<Square[]>(() => {
    const out: Square[] = [];
    for (const c of context.closed) out[c.position - 1] = c.outcome === "correct" ? "right" : "miss";
    return out;
  });
  const [remaining, setRemaining] = useState(() => (initial.deadlineAt ? Math.max(0, Math.min(LEAP_QUESTION_MS, msUntil(initial.deadlineAt, { offset: initialOffset }))) : LEAP_QUESTION_MS));
  const [picked, setPicked] = useState<LeapOptionId | null>(null);
  const [correctId, setCorrectId] = useState<LeapOptionId | null>(null);
  const [hidden, setHidden] = useState<LeapOptionId[]>(initial.question?.hiddenOptionIds ?? []);
  const [result, setResult] = useState<Result | null>(null);
  const [question, setQuestion] = useState(initial.question);
  const [qPos, setQPos] = useState(initial.position);
  const [brokenKey, setBrokenKey] = useState(0);
  const [pop, setPop] = useState<{ key: number; text: string; sub: string; color: string } | null>(null);
  const [streakKey, setStreakKey] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [lifelineBusy, setLifelineBusy] = useState(false);

  const position = run.position;

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };
  const enqueue = (job: () => Promise<void>) => {
    chain.current = chain.current.then(job).catch(() => {});
  };
  const mark = (s: Square) => {
    const i = posRef.current - 1; // read now: the updater runs after posRef moves on
    setSquares((xs) => {
      const n = [...xs];
      n[i] = s;
      return n;
    });
  };
  const showPop = (text: string, sub: string, color: string) => {
    popUntil.current = performance.now() + 1600;
    setPop({ key: counter.current++, text, sub, color });
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    stage.current?.run((s) => s.setTarget(phase === "play" || phase === "starting" || phase === "ready" || phase === "intro" ? posRef.current : null));
  }, [phase, position]);

  // Keep the hopper framed in the open sky between the HUD and the question card.
  const dockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dock = dockRef.current;
    const root = dock?.parentElement;
    if (!dock || !root) return;
    const measure = () => {
      const H = root.clientHeight || 1;
      const cardTop = H - dock.offsetHeight;
      const hud = 76;
      stage.current?.run((s) => s.setFocus((hud + Math.max(hud + 60, cardTop)) / 2 / H));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(dock);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const onFrame = useCallback((f: { hopperX: number; hopperY: number }) => {
    const el = popRef.current;
    if (el && performance.now() < popUntil.current) {
      el.style.left = `${f.hopperX}px`;
      el.style.top = `${f.hopperY}px`;
    }
  }, []);

  // ------------------------------------------------------------------------------------
  // Questions

  const startQuestion = () => {
    const ph = phaseRef.current;
    if (ph !== "intro" && ph !== "ready" && ph !== "result") return;
    if (run.status !== "in_progress") return finish(run);
    sfx.click();
    go("starting");
    setResult(null);
    setPicked(null);
    setCorrectId(null);
    setHidden([]);
    setQuestion(null);
    const pos = posRef.current;
    enqueue(async () => {
      try {
        const s = await runApi.startPrompt<LeapRunState>(runId, clock.current);
        if (posRef.current !== pos) return;
        setRun(s);
        if (s.status !== "in_progress") return finish(s);
        if (!s.question) {
          // The clock had already run out on this one (a reload long after): count it and move on.
          return onTimedOut(s);
        }
        setQuestion(s.question);
        setQPos(s.position);
        setHidden(s.question.hiddenOptionIds);
        setRemaining(s.deadlineAt ? Math.max(0, Math.min(LEAP_QUESTION_MS, msUntil(s.deadlineAt, clock.current))) : LEAP_QUESTION_MS);
        go("play");
      } catch (e) {
        go("ready");
        onError(e);
      }
    });
  };

  const finish = (s: LeapRunState) => {
    if (phaseRef.current === "ending") return;
    go("ending");
    setRun(s);
    if (s.outcome === "cleared") {
      sfx.levelUp();
      stage.current?.run((sc) => sc.summit());
    } else sfx.timeout();
    later(() => router.push(s.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`), s.outcome === "cleared" ? 3200 : 2600);
  };

  /** After a result: the next "Ready? JUMP", or the end of the climb. */
  const settle = (s: LeapRunState) => {
    setRun(s);
    posRef.current = s.status === "in_progress" ? s.position : posRef.current;
    if (s.status !== "in_progress") later(() => finish(s), 1600);
  };

  const onRight = (r: Extract<LeapAnswerResponse["result"], { correct: true }>, s: LeapRunState) => {
    const pos = posRef.current;
    setCorrectId(r.correctOptionId);
    mark("right");
    sfx.correct(r.multiplier >= 2 ? 4 : r.multiplier > 1 ? 3 : 2);
    setResult({ kind: "right", points: r.points, multiplier: r.multiplier, speedBonus: r.speedBonus, halved: r.halved, explanation: r.explanation });
    stage.current?.run((sc) => sc.jumpTo(pos, () => sfx.pop()));
    later(() => showPop(`+${r.points}`, r.multiplier > 1 ? `×${r.multiplier} streak` : r.halved ? "50/50 · half" : "nice leap!", "var(--reward)"), 650);
    if (s.streak >= 3) setStreakKey((k) => k + 1);
    go("result");
    settle(s);
  };

  const onMiss = (s: LeapRunState, res: Result, correct: LeapOptionId | null) => {
    const pos = posRef.current;
    if (correct) setCorrectId(correct);
    mark("miss");
    sfx.wrong();
    setResult(res);
    setBrokenKey((k) => k + 1);
    const fatal = s.hearts <= 0;
    stage.current?.run((sc) => sc.miss(pos, fatal));
    go("result");
    settle(s);
  };

  const onTimedOut = (s: LeapRunState) => {
    sfx.timeout();
    setRemaining(0);
    onMiss(s, { kind: "timeout" }, null);
  };

  const requestTimeout = () => {
    if (timeoutBusy.current) return;
    timeoutBusy.current = true;
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) return;
      try {
        const s = await runApi.timeout<LeapRunState>(runId, clock.current);
        if (phaseRef.current !== "play" || posRef.current !== pos) return;
        if (s.status !== "in_progress" || s.position !== pos || !s.question) {
          timeoutBusy.current = false;
          return onTimedOut(s);
        }
        setRun(s);
        later(() => {
          timeoutBusy.current = false;
        }, 300);
      } catch (e) {
        timeoutBusy.current = false;
        onError(e);
      }
    });
  };

  const answer = (id: LeapOptionId) => {
    if (phaseRef.current !== "play" || picked || hidden.includes(id)) return;
    sfx.click();
    setPicked(id);
    const pos = posRef.current;
    enqueue(async () => {
      try {
        const { result: r, state: s } = await runApi.answer(runId, { optionId: id, position: pos }, clock.current);
        if (posRef.current !== pos) return;
        if ("timedOut" in r) return onTimedOut(s);
        if (r.correct) return onRight(r, s);
        onMiss(s, { kind: "wrong", explanation: r.explanation }, r.correctOptionId);
      } catch (e) {
        setPicked(null);
        onError(e);
      }
    });
  };

  const fiftyFifty = () => {
    if (phaseRef.current !== "play" || !run.lifelineAvailable || picked || lifelineBusy) return;
    sfx.click();
    setLifelineBusy(true);
    const pos = posRef.current;
    enqueue(async () => {
      try {
        const res = await runApi.lifeline(runId, clock.current, pos);
        if (posRef.current !== pos) return;
        sfx.whoosh();
        setHidden(res.hiddenOptionIds);
        setRun(res.state);
      } catch (e) {
        onError(e);
      } finally {
        setLifelineBusy(false);
      }
    });
  };

  const onError = (e: unknown) => {
    if (e instanceof RunApiError && e.status === 401) return setNotice("You're signed out. Sign in again to keep climbing.");
    if (e instanceof RunApiError && e.status === 0) {
      setNotice("Connection lost · reconnecting…");
      later(resync, 1500);
      return;
    }
    if (e instanceof RunApiError && e.status === 409) return resync();
    setNotice(e instanceof Error ? e.message : "Something went wrong");
  };

  const resync = () => {
    enqueue(async () => {
      try {
        const s = await runApi.state<LeapRunState>(runId, clock.current);
        setNotice(null);
        if (s.status !== "in_progress") return finish(s);
        if (phaseRef.current === "play" && (s.position !== posRef.current || !s.question)) return onTimedOut(s);
        setRun(s);
      } catch (err) {
        if (err instanceof RunApiError && err.status === 0) later(resync, 2500);
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  // ------------------------------------------------------------------------------------
  // Clock and keys

  const onTick = useEffectEvent(() => {
    if (phaseRef.current !== "play" || !run.deadlineAt) return;
    const rem = Math.min(LEAP_QUESTION_MS, msUntil(run.deadlineAt, clock.current));
    setRemaining(Math.max(0, rem));
    if (rem <= 0) requestTimeout();
  });

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase, position]);

  useEffect(() => {
    if (phase === "result" || phase === "intro" || phase === "ready") nextBtn.current?.focus({ preventScroll: true });
  }, [phase]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    const ph = phaseRef.current;
    if (ph === "play" && question) {
      const i = "1234".indexOf(e.key) !== -1 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && i < question.options.length) {
        e.preventDefault();
        answer(question.options[i].id);
      }
      if (e.key === "5" || e.key === "h") fiftyFifty();
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ------------------------------------------------------------------------------------
  // Render

  const secs = remaining / 1000;
  const hot = phase === "play" && remaining <= 5000;
  const finished = run.status !== "in_progress";
  const optionState = (id: LeapOptionId): string | undefined => {
    if (hidden.includes(id)) return "hidden";
    if (phase !== "result" && phase !== "ending") return picked === id ? "dim" : undefined;
    if (id === correctId) return "right";
    if (id === picked) return "wrong";
    return "dim";
  };
  const nextMult = run.nextMultiplier;
  const streakLine = run.streak >= 5 ? `${run.streak} in a row · ×2` : run.streak >= 3 ? `${run.streak} in a row · ×1.5` : run.streak > 0 ? `${run.streak} in a row` : null;
  const toNext = run.streak >= 5 ? 0 : run.streak >= 3 ? 5 - run.streak : 3 - run.streak;

  return (
    <div data-theme="leap" className="lp-root relative isolate h-[100dvh] w-full overflow-hidden font-sans">
      <LeapStage ref={stage} count={total} platform={startPlatform} crumbled={startCrumbled} onFrame={onFrame} />

      {/* top HUD */}
      <header className="absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => {
              sfx.click();
              setMenuOpen((o) => !o);
            }}
            className="lp-btn grid h-10 w-10 shrink-0 place-items-center !p-0"
          >
            <PixelIcon name="menu" size={16} />
          </button>
          <div className="lp-card hidden min-w-0 px-3 py-1.5 sm:block">
            <b className="block font-display text-[18px] leading-none tracking-[0.08em] text-accent">LEAP</b>
            <span className="block max-w-[24ch] truncate text-[12px] text-muted">{context.gameTitle}</span>
          </div>
        </div>
        <div className="lp-card flex flex-col items-center gap-1 px-3 py-2">
          <span className="font-hud text-[16px] leading-none tracking-[0.2em] text-muted sm:text-[18px]">
            Q {Math.min(position, total)} / {total}
          </span>
          <div className="flex gap-[3px]" role="img" aria-label={`${squares.filter((s) => s === "right").length} correct so far`}>
            {Array.from({ length: total }, (_, i) => {
              const s = squares[i];
              const now = !s && i === position - 1 && !finished;
              return (
                <span
                  key={i}
                  className="h-2.5 w-2.5 rounded-[3px] transition-colors duration-300 sm:h-3 sm:w-3"
                  style={{
                    background: s === "right" ? "var(--success)" : s === "miss" ? "var(--danger)" : "rgba(255,255,255,.14)",
                    boxShadow: now ? "0 0 0 2px var(--reward)" : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="lp-card flex flex-col items-end gap-1 px-3 py-1.5">
            <div className="flex gap-1" role="img" aria-label={`${run.hearts} of ${run.maxHearts} hearts left`}>
              {Array.from({ length: run.maxHearts }, (_, i) => {
                const alive = i < run.hearts;
                const justBroke = !alive && i === run.hearts && brokenKey > 0;
                return (
                  <span key={`${i}-${justBroke ? brokenKey : 0}`} className="inline-block" style={{ animation: justBroke ? "lp-heart-break .7s ease-out forwards" : undefined, filter: alive || justBroke ? undefined : "grayscale(1) brightness(.45)", opacity: alive || justBroke ? 1 : 0.5 }}>
                    <PixelIcon name="heart" size={20} palette={{ p: "#ff4f7b", w: "#ffd0dc" }} />
                  </span>
                );
              })}
            </div>
            <span className="font-hud text-[22px] leading-none text-reward tabular-nums" aria-live="polite">
              {run.score.toLocaleString("en-US")}
            </span>
          </div>
          <SoundToggle />
        </div>
      </header>

      {/* streak / multiplier chip */}
      <div className="absolute top-[86px] right-3 z-20 flex flex-col items-end gap-1 sm:top-[96px] sm:right-5">
        {streakLine && (
          <span key={streakKey} className="lp-chip flex items-center gap-1.5 text-reward" style={{ animation: streakKey ? "lp-streak .5s var(--ease-snap)" : undefined }}>
            <PixelIcon name="flame" size={14} /> {streakLine}
          </span>
        )}
        {!finished && (
          <span className="lp-chip text-[15px] text-muted">
            next ×{nextMult}
            {toNext > 0 && <span className="hidden text-faint sm:inline"> · ×{streakMultiplier(run.streak + toNext)} in {toNext}</span>}
          </span>
        )}
      </div>

      {menuOpen && (
        <div className="lp-card absolute top-16 left-3 z-30 w-[min(340px,calc(100%-1.5rem))] p-4" style={{ animation: "pop-in .3s var(--ease-snap) both" }}>
          <p className="font-display text-[13px] tracking-[0.2em] text-muted">CLIMBING</p>
          <p className="mt-1 truncate font-display text-[20px]">{context.gameTitle}</p>
          <p className="mt-2 text-[13px] leading-snug text-muted">A question&apos;s clock keeps running while this menu is open. Leaving ends nothing: reopen the Run from the Game page.</p>
          <div className="mt-3 flex flex-col gap-1.5 text-[15px]">
            <button type="button" onClick={() => setMenuOpen(false)} className="text-left font-semibold text-accent hover:underline">
              ▸ Back to the climb
            </button>
            <Link href={`/games/${context.gameId}`} className="text-muted hover:text-text hover:underline">
              ▸ Return to the Game page
            </Link>
          </div>
        </div>
      )}

      {/* the points pop over the hopper */}
      <div ref={popRef} className="pointer-events-none absolute top-1/3 left-1/2 z-[15] text-center whitespace-nowrap" aria-hidden="true">
        {pop && (
          <div key={pop.key} style={{ animation: "lp-pop 1.6s var(--ease-out) forwards", color: pop.color }}>
            <div className="font-display text-[44px] leading-none" style={{ textShadow: "0 3px 0 #7a5a00, 0 0 18px rgba(255,216,77,.6)" }}>
              {pop.text}
            </div>
            <div className="font-hud text-[20px] tracking-[0.12em] text-text uppercase" style={{ textShadow: "0 2px 0 rgba(0,0,0,.4)" }}>
              {pop.sub}
            </div>
          </div>
        )}
      </div>

      {/* bottom: intro, ready beat, question card, result */}
      <div ref={dockRef} className="absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-6">
        {(phase === "intro" || phase === "ready" || (phase === "starting" && !question)) && (
          <section className="lp-card w-full max-w-[560px] p-5 text-center" style={{ animation: "lp-card-in .45s var(--ease-out) both" }} aria-label="Ready">
            {phase === "intro" ? (
              <>
                <p className="font-display text-[13px] tracking-[0.25em] text-accent">LEAP · {context.gameTitle}</p>
                <h1 className="mt-1 font-display text-[34px] leading-tight sm:text-[42px]">Jump to the summit</h1>
                <p className="mx-auto mt-2 max-w-[44ch] text-[15px] text-muted">
                  {total} questions, 15 s each, one answer. Right answers leap you up an island; wrong ones crumble it and cost a heart. Lose all three and you fall.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2 text-[14px]">
                  <span className="lp-chip text-[15px]">♥ ×3</span>
                  <span className="lp-chip text-[15px] text-reward">3 in a row ×1.5 · 5 in a row ×2</span>
                  <span className="lp-chip text-[15px] text-signal">one 50/50</span>
                </div>
              </>
            ) : (
              <>
                <p className="font-display text-[13px] tracking-[0.25em] text-muted">QUESTION {Math.min(position, total)} OF {total}</p>
                <h2 className="mt-1 font-display text-[30px] sm:text-[36px]">Ready?</h2>
              </>
            )}
            <button ref={nextBtn} type="button" onClick={startQuestion} disabled={phase === "starting"} className="lp-btn lp-btn-primary mt-4 px-10 py-3 text-[24px]">
              {phase === "starting" ? "…" : "JUMP ▲"}
            </button>
            <p className="mt-2 font-hud text-[16px] tracking-[0.15em] text-faint">ENTER · KEYS 1–4 ANSWER</p>
          </section>
        )}

        {question && (phase === "play" || phase === "result" || phase === "starting" || phase === "ending") && (
          <section key={qPos} className="lp-card w-full max-w-[680px] p-3.5 sm:p-5" style={{ animation: "lp-card-in .45s var(--ease-out) both" }} aria-label={`Question ${qPos} of ${total}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-[13px] tracking-[0.2em] text-muted">
                QUESTION {qPos} / {total}
              </span>
              <span className={`font-hud text-[28px] leading-none tabular-nums ${hot ? "text-danger" : "text-text"}`} role="timer" aria-label={`${Math.ceil(secs)} seconds left`}>
                {secs.toFixed(1)}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full origin-left rounded-full"
                style={{
                  transform: `scaleX(${Math.max(0, remaining / LEAP_QUESTION_MS)})`,
                  background: hot ? "linear-gradient(90deg, #ff5c5c, #ff9f43)" : "linear-gradient(90deg, var(--accent), var(--reward))",
                  transition: "transform .1s linear",
                }}
              />
            </div>
            <p className="mt-3 text-[18px] leading-snug font-bold text-balance sm:text-[21px]">{question.text}</p>
            <div className="mt-3 grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:gap-2.5" role="group" aria-label="Options">
              {question.options.map((o, i) => (
                <button
                  key={o.id}
                  type="button"
                  className="lp-option"
                  data-state={optionState(o.id)}
                  disabled={phase !== "play" || !!picked || hidden.includes(o.id)}
                  onMouseEnter={() => sfx.hover()}
                  onClick={() => answer(o.id)}
                  aria-label={`${KEYS[i]}: ${o.text}${hidden.includes(o.id) ? " (removed by 50/50)" : ""}`}
                >
                  <span className="lp-key">{KEYS[i]}</span>
                  <span className="min-w-0 flex-1">{o.text}</span>
                  {optionState(o.id) === "right" && <span className="text-success">✓</span>}
                  {optionState(o.id) === "wrong" && <span className="text-danger">✗</span>}
                </button>
              ))}
            </div>

            {phase === "result" || phase === "ending" ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between" style={{ animation: "lp-fade-in .3s both" }} aria-live="polite">
                <div className="min-w-0">
                  {result?.kind === "right" ? (
                    <p className="font-display text-[22px] text-success">
                      Nice leap! <span className="text-reward">+{result.points}</span>
                      {result.multiplier > 1 && <span className="ml-1 text-[16px] text-reward"> · ×{result.multiplier}</span>}
                      {result.halved && <span className="ml-1 text-[14px] text-muted"> · 50/50 half</span>}
                    </p>
                  ) : result?.kind === "wrong" ? (
                    <p className="font-display text-[22px] text-danger">The platform crumbles</p>
                  ) : (
                    <p className="font-display text-[22px] text-danger">Too slow, it crumbles</p>
                  )}
                  {result && result.kind !== "timeout" && result.explanation && <p className="mt-0.5 text-[14px] leading-snug text-muted">{result.explanation}</p>}
                  {result?.kind === "timeout" && <p className="mt-0.5 text-[14px] text-muted">The right answer is in the Climb Report.</p>}
                </div>
                {phase === "result" && (
                  <button ref={nextBtn} type="button" onClick={startQuestion} className="lp-btn lp-btn-primary shrink-0 px-6 py-2.5 text-[18px]">
                    {finished ? "CLIMB REPORT ▸" : "READY? JUMP ▲"}
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="hidden font-hud text-[16px] tracking-[0.1em] text-faint sm:inline">KEYS 1–4 · 5 FOR 50/50</span>
                <button
                  type="button"
                  onClick={fiftyFifty}
                  disabled={phase !== "play" || !run.lifelineAvailable || !!picked || lifelineBusy}
                  className="lp-btn ml-auto text-[15px] text-signal"
                  title="Removes two wrong options. This question then scores half."
                >
                  {run.lifelineAvailable ? "50/50 · half points" : "50/50 used"}
                </button>
              </div>
            )}
            {notice && (
              <p className="mt-2 text-center text-[14px] text-caution" role="status">
                {notice}
              </p>
            )}
          </section>
        )}
      </div>

      {phase === "ending" && (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 text-center">
          <p className="font-display text-[56px] leading-none sm:text-[84px]" style={{ color: run.outcome === "cleared" ? "var(--reward)" : "var(--danger)", textShadow: "0 5px 0 rgba(0,0,0,.35), 0 0 30px currentColor", animation: "lp-banner .8s var(--ease-snap) both" }}>
            {run.outcome === "cleared" ? "SUMMIT!" : "YOU FELL"}
          </p>
          <p className="mt-2 font-hud text-[22px] tracking-[0.2em] text-text" style={{ animation: "lp-fade-in .4s .5s both", textShadow: "0 2px 0 rgba(0,0,0,.4)" }}>
            {run.score.toLocaleString("en-US")} POINTS · CLIMB REPORT INCOMING
          </p>
        </div>
      )}
    </div>
  );
}
