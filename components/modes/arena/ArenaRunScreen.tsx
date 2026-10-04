"use client";
// The Arena Run screen (/runs/[runId] for an Arena Game): a first-person training room. The
// question floats on a holo-board; 4 answer targets drift at different depths; shoot the right
// one. Flow (docs/architecture/run-and-scoring.md § Arena, docs/design/modes/arena.md):
//   intro → ENTER ARENA (locks the mouse on desktop; tap/click-to-aim otherwise) → 3·2·1 on the
//   board → POST start-prompt (the targets appear only now) → shoot: a wrong target shatters
//   (−3 s, −25, streak reset) and you keep shooting; the right one explodes (+points pop) →
//   the explanation shows, the next round starts by itself (or shoot / Enter) → … after 10:
//   ARENA CLEARED → the After-Action Report.
// Esc releases the mouse and pauses the round countdown (a question's clock is the server's and
// keeps running). Keys 1–4 shoot a target directly. The server owns the clock and the score.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react";
import { ARENA_PENALTY_MS, ARENA_QUESTION_MS, streakMultiplier } from "@/lib/modes/arena/rules";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { ArenaHitResponse, ArenaRunState, LeapOptionId, PromptOutcome } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { ArenaStage, type ArenaStageHandle } from "./ArenaStage";
import type { ArenaShot } from "./scene";
import "./arena.css";

type Phase = "intro" | "ready" | "countdown" | "starting" | "play" | "result" | "ending";
type Square = "right" | "miss" | undefined;
type Result =
  | { kind: "right"; points: number; multiplier: number; speedBonus: number; wrongHits: number; explanation: string | null }
  | { kind: "timeout"; penalty: boolean };

type Props = {
  initial: ArenaRunState;
  context: {
    runId: string;
    gameId: string;
    gameTitle: string;
    closed: { position: number; outcome: PromptOutcome; points: number }[];
  };
};

const TARGET_COLOR: Record<LeapOptionId, string> = { A: "#4de3ff", B: "#9d7bff", C: "#ffd84d", D: "#ff5d8f" };
const NEXT_MS = 6000; //       auto-continue after a result
const SKIP_AFTER_MS = 1200; // shooting or Enter skips the wait after this long

const isTouch = () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
const noSubscribe = () => () => {};

export function ArenaRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const total = initial.promptCount;
  const stage = useRef<ArenaStageHandle>(null);
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(1);
  const timeoutBusy = useRef(false);
  const inflight = useRef(new Set<LeapOptionId>());
  const resultAt = useRef(0);
  const lockWanted = useRef(false); //  we asked for pointer lock and haven't had it yet
  const wasLocked = useRef(false);
  const nextBtn = useRef<HTMLButtonElement>(null);

  const fresh = initial.position === 1 && !initial.startedAt && context.closed.length === 0;
  const startPhase: Phase = initial.question ? "play" : fresh ? "intro" : "ready";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const posRef = useRef(initial.position);
  const [run, setRun] = useState(initial);
  const [question, setQuestion] = useState(initial.question);
  const [shattered, setShattered] = useState<LeapOptionId[]>(initial.question?.shatteredOptionIds ?? []);
  const [squares, setSquares] = useState<Square[]>(() => {
    const out: Square[] = [];
    for (const c of context.closed) out[c.position - 1] = c.outcome === "correct" ? "right" : "miss";
    return out;
  });
  const [remaining, setRemaining] = useState(() =>
    initial.deadlineAt ? Math.max(0, Math.min(ARENA_QUESTION_MS, msUntil(initial.deadlineAt, { offset: initialOffset }))) : ARENA_QUESTION_MS,
  );
  const [result, setResult] = useState<Result | null>(null);
  const [pop, setPop] = useState<{ key: number; x: number; y: number; text: string; sub: string } | null>(null);
  const [penaltyKey, setPenaltyKey] = useState(0);
  const [hitMark, setHitMark] = useState<{ key: number; color: string } | null>(null);
  const [streakKey, setStreakKey] = useState(0);
  const [count, setCount] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [aimMode, setAimMode] = useState<"lock" | "pointer">("pointer");
  // Touch screens aim by tapping (client-only; false while server rendering)
  const touch = useSyncExternalStore(noSubscribe, isTouch, () => false);
  const [stageOk, setStageOk] = useState<boolean | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const nextAt = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const position = run.position;
  const finished = run.status !== "in_progress";

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
    const i = posRef.current - 1;
    setSquares((xs) => {
      const n = [...xs];
      n[i] = s;
      return n;
    });
  };
  const setPause = (p: boolean) => {
    pausedRef.current = p;
    setPaused(p);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  // Shooting and moving are allowed while a question or a result is up and nothing covers the room
  useEffect(() => {
    const on = !paused && (phase === "play" || phase === "result");
    stage.current?.run((s) => s.setInput(on));
  }, [phase, paused]);

  // A reload mid-question: put the targets back (shattered ones stay down)
  useEffect(() => {
    const q = initial.question;
    if (q) stage.current?.run((s) => s.showQuestion({ position: initial.position, total, text: q.text, options: q.options, shattered: q.shatteredOptionIds }));
    else if (!fresh) stage.current?.run((s) => s.setBoard({ kicker: `QUESTION ${initial.position} / ${total}`, title: "READY?", body: "Step up when you are." }));
    else stage.current?.run((s) => s.setBoard({ kicker: "TRAINING ARENA", title: "ARENA", body: context.gameTitle }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, with the server's state at load
  }, []);

  // ------------------------------------------------------------------------------------
  // Rounds

  const finish = (s: ArenaRunState) => {
    if (phaseRef.current === "ending") return;
    go("ending");
    setRun(s);
    setNextIn(null);
    sfx.levelUp();
    stage.current?.run((sc) => {
      sc.exitLock();
      sc.setBoard({ kicker: "ROUND OVER", title: "ARENA CLEARED", body: `${s.score.toLocaleString("en-US")} points · ${s.correctCount} of ${total} right`, tone: "gold" });
    });
    later(() => router.push(s.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`), 3000);
  };

  /** After a result: the next round starts by itself, or the Run ends. */
  const settle = (s: ArenaRunState) => {
    setRun(s);
    resultAt.current = performance.now();
    if (s.status === "in_progress") {
      posRef.current = s.position;
      nextAt.current = performance.now() + NEXT_MS;
      setNextIn(Math.ceil(NEXT_MS / 1000));
    } else later(() => finish(s), 1800);
  };

  const onRight = (id: LeapOptionId, r: Extract<ArenaHitResponse["result"], { correct: true }>, s: ArenaRunState) => {
    mark("right");
    sfx.blast();
    sfx.correct(r.multiplier >= 2 ? 4 : r.multiplier > 1 ? 3 : 2);
    setHitMark({ key: counter.current++, color: "#3ddc97" });
    stage.current?.run((sc) => {
      const at = sc.explode(id) ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      setPop({
        key: counter.current++,
        x: at.x,
        y: at.y,
        text: `+${r.points}`,
        sub: r.multiplier > 1 ? `×${r.multiplier} streak` : r.wrongHits ? `−${r.wrongHits * 25} for misses` : r.speedBonus >= 40 ? "quick draw!" : "direct hit",
      });
      sc.setBoard({ kicker: "DIRECT HIT", title: `+${r.points}`, body: r.explanation ?? undefined, tone: "good" });
    });
    if (s.streak >= 3) setStreakKey((k) => k + 1);
    setResult({ kind: "right", points: r.points, multiplier: r.multiplier, speedBonus: r.speedBonus, wrongHits: r.wrongHits, explanation: r.explanation });
    setAnnounce(`Correct, plus ${r.points} points. ${r.explanation ?? ""}`);
    go("result");
    settle(s);
  };

  const onTimedOut = (s: ArenaRunState, penalty: boolean) => {
    mark("miss");
    sfx.timeout();
    setRemaining(0);
    stage.current?.run((sc) => {
      sc.timeUp();
      sc.setBoard({ kicker: "TIME UP", title: penalty ? "OUT OF TIME" : "TOO SLOW", body: "The right answer is in the After-Action Report.", tone: "bad" });
    });
    setResult({ kind: "timeout", penalty });
    setAnnounce("Time up. No points for this one.");
    go("result");
    settle(s);
  };

  const onWrong = (id: LeapOptionId, s: ArenaRunState) => {
    sfx.shatter();
    sfx.wrong();
    setHitMark({ key: counter.current++, color: "#ff5c5c" });
    setPenaltyKey((k) => k + 1);
    setShattered((xs) => (xs.includes(id) ? xs : [...xs, id]));
    stage.current?.run((sc) => sc.shatter(id));
    setRun(s);
    if (s.deadlineAt) setRemaining(Math.max(0, Math.min(ARENA_QUESTION_MS, msUntil(s.deadlineAt, clock.current))));
    setAnnounce(`${id} is wrong. Minus 3 seconds.`);
  };

  const onError = (e: unknown) => {
    if (e instanceof RunApiError && e.status === 401) return setNotice("You're signed out. Sign in again to keep playing.");
    if (e instanceof RunApiError && e.status === 0) {
      setNotice("Connection lost · reconnecting…");
      later(resync, 1500);
      return;
    }
    if (e instanceof RunApiError && e.status === 409) return resync();
    setNotice(e instanceof Error ? e.message : "Something went wrong");
  };

  function resync() {
    enqueue(async () => {
      try {
        const s = await runApi.state<ArenaRunState>(runId, clock.current);
        setNotice(null);
        if (s.status !== "in_progress") return finish(s);
        if (phaseRef.current === "play" && (s.position !== posRef.current || !s.question)) return onTimedOut(s, false);
        setRun(s);
        if (s.question) setShattered(s.question.shatteredOptionIds);
      } catch (err) {
        if (err instanceof RunApiError && err.status === 0) later(resync, 2500);
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }

  const enter = (aim: "lock" | "pointer") => {
    sfx.unlock();
    sfx.click();
    const lock = aim === "lock" && !touch;
    setAimMode(lock ? "lock" : "pointer");
    if (lock) {
      lockWanted.current = true;
      stage.current?.run((s) => s.requestLock());
    } else stage.current?.run((s) => s.usePointerAim());
    setPause(false);
    beginCountdown();
  };

  /** 3 · 2 · 1 on the holo-board, then the question starts. Holds while paused. */
  const beginCountdown = () => {
    const ph = phaseRef.current;
    if (ph !== "intro" && ph !== "ready" && ph !== "result") return;
    if (run.status !== "in_progress") return finish(run);
    setResult(null);
    setNextIn(null);
    setQuestion(null);
    setShattered([]);
    inflight.current.clear();
    go("countdown");
    const pos = posRef.current;
    const steps = ["3", "2", "1"];
    const stepMs = 650;
    let i = 0;
    const tick = () => {
      if (phaseRef.current !== "countdown" || posRef.current !== pos) return;
      if (pausedRef.current) return later(tick, 200);
      if (i < steps.length) {
        const n = steps[i++];
        setCount(n);
        sfx.tick();
        stage.current?.run((s) => s.setBoard({ kicker: `QUESTION ${pos} / ${total}`, title: n, tone: "gold" }));
        later(tick, stepMs);
      } else {
        setCount(null);
        startQuestion();
      }
    };
    tick();
  };

  const startQuestion = () => {
    go("starting");
    const pos = posRef.current;
    enqueue(async () => {
      try {
        const s = await runApi.startPrompt<ArenaRunState>(runId, clock.current);
        if (posRef.current !== pos) return;
        setRun(s);
        if (s.status !== "in_progress") return finish(s);
        if (!s.question) return onTimedOut(s, false); // its clock had already run out (a reload long after)
        const q = s.question;
        sfx.ping();
        setQuestion(q);
        setShattered(q.shatteredOptionIds);
        setRemaining(s.deadlineAt ? Math.max(0, Math.min(ARENA_QUESTION_MS, msUntil(s.deadlineAt, clock.current))) : ARENA_QUESTION_MS);
        stage.current?.run((sc) => sc.showQuestion({ position: s.position, total, text: q.text, options: q.options, shattered: q.shatteredOptionIds }));
        setAnnounce(`Question ${s.position} of ${total}: ${q.text} Targets: ${q.options.map((o) => `${o.id}, ${o.text}`).join("; ")}.`);
        go("play");
      } catch (e) {
        go("ready");
        onError(e);
      }
    });
  };

  /** A target was hit (by aim or keys 1–4): the server decides. */
  const sendHit = (id: LeapOptionId) => {
    if (phaseRef.current !== "play" || inflight.current.has(id) || shattered.includes(id)) return;
    inflight.current.add(id);
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) {
        inflight.current.delete(id);
        return;
      }
      try {
        const { result: r, state: s } = await runApi.hit(runId, { optionId: id, position: pos }, clock.current);
        inflight.current.delete(id);
        if (posRef.current !== pos || phaseRef.current !== "play") return;
        if ("timedOut" in r) return onTimedOut(s, false);
        if (r.correct) return onRight(id, r, s);
        onWrong(id, s);
        if (r.closed) onTimedOut(s, true);
      } catch (e) {
        inflight.current.delete(id);
        stage.current?.run((sc) => sc.release(id));
        onError(e);
      }
    });
  };

  const next = () => {
    if (phaseRef.current !== "result") return;
    if (finished) return finish(run);
    beginCountdown();
  };

  // The stage keeps its callbacks in a ref, so these plain handlers always see this render's state
  const handleShot = (shot: ArenaShot) => {
    sfx.laser();
    const ph = phaseRef.current;
    if (ph === "result" && performance.now() - resultAt.current > SKIP_AFTER_MS) return next();
    if (ph !== "play" || !shot.optionId) return;
    setHitMark({ key: counter.current++, color: "#ffffff" });
    sendHit(shot.optionId);
  };

  const handleLock = (isLocked: boolean) => {
    setLocked(isLocked);
    if (isLocked) {
      lockWanted.current = false;
      wasLocked.current = true;
      setNotice(null);
      setPause(false);
      return;
    }
    if (lockWanted.current && !wasLocked.current) {
      // The browser refused the lock (or an automated tab): fall back to click-to-aim
      lockWanted.current = false;
      setAimMode("pointer");
      setNotice("Mouse lock isn't available here, so click targets to shoot.");
      return;
    }
    wasLocked.current = false;
    const ph = phaseRef.current;
    if (aimMode === "lock" && (ph === "countdown" || ph === "starting" || ph === "play" || ph === "result")) setPause(true);
  };

  const resume = (aim: "lock" | "pointer") => {
    sfx.click();
    if (aim === "lock") {
      lockWanted.current = true;
      setAimMode("lock");
      stage.current?.run((s) => s.requestLock());
    } else {
      setAimMode("pointer");
      stage.current?.run((s) => s.usePointerAim());
    }
    if (pausedRef.current) nextAt.current = performance.now() + NEXT_MS; // a fresh wait after a pause
    setPause(false);
  };

  const requestTimeout = () => {
    if (timeoutBusy.current) return;
    timeoutBusy.current = true;
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) {
        timeoutBusy.current = false;
        return;
      }
      try {
        const s = await runApi.timeout<ArenaRunState>(runId, clock.current);
        if (phaseRef.current !== "play" || posRef.current !== pos) {
          timeoutBusy.current = false;
          return;
        }
        if (s.status !== "in_progress" || s.position !== pos || !s.question) {
          timeoutBusy.current = false;
          return onTimedOut(s, false);
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

  // ------------------------------------------------------------------------------------
  // Clocks and keys

  const onTick = useEffectEvent(() => {
    const ph = phaseRef.current;
    if (ph === "play" && run.deadlineAt) {
      const rem = Math.min(ARENA_QUESTION_MS, msUntil(run.deadlineAt, clock.current));
      const before = Math.ceil(remaining / 1000);
      setRemaining(Math.max(0, rem));
      if (rem > 0 && rem <= 5000 && Math.ceil(rem / 1000) !== before) sfx.tick();
      if (rem <= 0) requestTimeout();
    }
    if (ph === "result" && !finished) {
      if (pausedRef.current) {
        nextAt.current += 100;
        return;
      }
      const left = nextAt.current - performance.now();
      setNextIn(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) next();
    }
  });

  useEffect(() => {
    if (phase !== "play" && phase !== "result") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase, position]);

  useEffect(() => {
    if (!locked && (phase === "intro" || phase === "ready" || phase === "result")) nextBtn.current?.focus({ preventScroll: true });
  }, [phase, locked]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    const ph = phaseRef.current;
    if (ph === "play" && question && !pausedRef.current) {
      const i = "1234".indexOf(e.key);
      if (i >= 0 && i < question.options.length) {
        e.preventDefault();
        const id = question.options[i].id;
        if (stageOk) stage.current?.run((s) => s.shootAt(id));
        else {
          sfx.laser();
          sendHit(id);
        }
      }
    }
    if (e.key === "Enter" && ph === "result" && !pausedRef.current && performance.now() - resultAt.current > SKIP_AFTER_MS && locked) {
      e.preventDefault();
      next();
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
  const streakLine = run.streak >= 5 ? `${run.streak} in a row · ×2` : run.streak >= 3 ? `${run.streak} in a row · ×1.5` : run.streak > 0 ? `${run.streak} in a row` : null;
  const toNext = run.streak >= 5 ? 0 : run.streak >= 3 ? 5 - run.streak : 3 - run.streak;
  const overlay = phase === "intro" || phase === "ready";
  const controlsLine = touch
    ? "TAP A TARGET TO SHOOT · DRAG TO LOOK"
    : locked
      ? "MOUSE AIM · CLICK SHOOT · WASD MOVE · ESC PAUSE"
      : "CLICK A TARGET · KEYS 1–4 SHOOT";

  return (
    <div data-theme="arena" className="ar-root relative isolate h-[100dvh] w-full overflow-hidden font-sans select-none">
      <ArenaStage ref={stage} mode="play" onShot={handleShot} onLockChange={handleLock} onReady={() => setStageOk(true)} onFailed={() => setStageOk(false)} />

      {/* low-time and penalty vignettes */}
      {hot && <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]" style={{ boxShadow: "inset 0 0 120px rgba(255,92,92,.35)" }} />}
      {penaltyKey > 0 && (
        <div key={`v${penaltyKey}`} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5]" style={{ boxShadow: "inset 0 0 160px rgba(255,92,92,.6)", animation: "ar-vignette .6s ease-out forwards" }} />
      )}

      {/* crosshair and hit markers */}
      {locked && !paused && (
        <div className="ar-crosshair z-10" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
      )}
      {hitMark && locked && <div key={hitMark.key} className="ar-hitmark z-10" style={{ ["--hm" as string]: hitMark.color }} aria-hidden="true" />}

      {/* top HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-3 pt-3 sm:px-5 sm:pt-4">
        <div className="pointer-events-auto flex min-w-0 items-center gap-2">
          <button
            type="button"
            aria-label="Pause"
            onClick={() => {
              sfx.click();
              setPause(true);
              stage.current?.run((s) => s.exitLock());
            }}
            className="ar-btn grid h-10 w-10 shrink-0 place-items-center !p-0 font-hud text-[20px]"
          >
            II
          </button>
          <div className="ar-plate hidden min-w-0 px-3 py-1.5 md:block">
            <b className="block font-display text-[18px] leading-none tracking-[0.12em] text-accent">ARENA</b>
            <span className="block max-w-[22ch] truncate text-[12px] text-muted">{context.gameTitle}</span>
          </div>
        </div>

        <div className="ar-plate flex min-w-[148px] flex-col items-center gap-1 px-3 py-2">
          <span className="font-hud text-[15px] leading-none tracking-[0.2em] text-muted">
            Q {Math.min(position, total)} / {total}
          </span>
          <div className="flex gap-[3px]" role="img" aria-label={`${squares.filter((s) => s === "right").length} right so far`}>
            {Array.from({ length: total }, (_, i) => {
              const s = squares[i];
              const now = !s && i === position - 1 && !finished;
              return (
                <span
                  key={i}
                  className="h-2.5 w-2.5 transition-colors duration-300"
                  style={{
                    background: s === "right" ? "var(--success)" : s === "miss" ? "var(--danger)" : "rgba(255,255,255,.14)",
                    boxShadow: now ? "0 0 0 2px var(--accent)" : undefined,
                  }}
                />
              );
            })}
          </div>
          <span
            className={`relative font-hud text-[40px] leading-[.9] tabular-nums ${hot ? "text-danger" : "text-text"}`}
            style={{ animation: hot ? "ar-hot .5s steps(2) infinite" : undefined }}
            role="timer"
            aria-label={phase === "play" ? `${Math.ceil(secs)} seconds left` : "clock stopped"}
          >
            {phase === "play" ? secs.toFixed(1) : phase === "result" || phase === "ending" ? (result?.kind === "timeout" ? "0.0" : secs.toFixed(1)) : (ARENA_QUESTION_MS / 1000).toFixed(1)}
            {penaltyKey > 0 && (
              <span key={penaltyKey} className="absolute top-full left-1/2 font-display text-[22px] text-danger" style={{ animation: "ar-penalty .9s ease-out forwards" }} aria-hidden="true">
                −{ARENA_PENALTY_MS / 1000} s
              </span>
            )}
          </span>
          <div className="h-1.5 w-full overflow-hidden bg-white/10">
            <div
              className="h-full origin-left"
              style={{
                transform: `scaleX(${phase === "play" ? Math.max(0, remaining / ARENA_QUESTION_MS) : phase === "countdown" || phase === "starting" ? 1 : 0})`,
                background: hot ? "linear-gradient(90deg, #ff5c5c, #ff9f43)" : "linear-gradient(90deg, var(--signal), var(--accent))",
                transition: "transform .1s linear",
              }}
            />
          </div>
        </div>

        <div className="pointer-events-auto flex items-start gap-2">
          <div className="flex flex-col items-end gap-1">
            <div className="ar-plate px-3 py-1.5 text-right">
              <span className="block font-hud text-[13px] leading-none tracking-[0.2em] text-muted">SCORE</span>
              <span className="font-hud text-[28px] leading-none text-reward tabular-nums" aria-live="polite">
                {run.score.toLocaleString("en-US")}
              </span>
            </div>
            {streakLine && (
              <span key={streakKey} className="ar-chip flex items-center gap-1.5 text-reward" style={{ animation: streakKey ? "ar-streak .5s var(--ease-snap)" : undefined }}>
                <PixelIcon name="flame" size={14} /> {streakLine}
              </span>
            )}
            {!finished && (
              <span className="ar-chip hidden text-[15px] text-muted sm:inline">
                next ×{run.nextMultiplier}
                {toNext > 0 && <span className="text-faint"> · ×{streakMultiplier(run.streak + toNext)} in {toNext}</span>}
              </span>
            )}
          </div>
          <SoundToggle />
        </div>
      </header>

      {/* the question on phones (the holo-board is too small there to read) */}
      {question && (phase === "play" || phase === "result") && (
        <div className="pointer-events-none absolute inset-x-3 top-[118px] z-10 sm:hidden">
          <p className="ar-plate px-3 py-2 text-center text-[15px] leading-snug font-bold text-balance">{question.text}</p>
        </div>
      )}

      {/* the score pop where the target blew up */}
      {pop && (
        <div
          key={pop.key}
          className="pointer-events-none absolute z-[15] text-center whitespace-nowrap"
          style={{ left: pop.x, top: pop.y, animation: "ar-pop 1.6s var(--ease-out) forwards" }}
          aria-hidden="true"
        >
          <div className="font-display text-[48px] leading-none text-reward" style={{ textShadow: "0 3px 0 #7a5a00, 0 0 22px rgba(255,216,77,.7)" }}>
            {pop.text}
          </div>
          <div className="font-hud text-[20px] tracking-[0.12em] text-text uppercase" style={{ textShadow: "0 2px 0 rgba(0,0,0,.6)" }}>
            {pop.sub}
          </div>
        </div>
      )}

      {/* the countdown, big over the room */}
      {phase === "countdown" && count && (
        <div className="pointer-events-none absolute inset-0 z-[15] grid place-items-center" aria-hidden="true">
          <span key={count} className="font-display text-[120px] leading-none text-reward sm:text-[160px]" style={{ animation: "ar-count .65s ease-out forwards", textShadow: "0 0 40px rgba(255,216,77,.6), 0 6px 0 rgba(0,0,0,.4)" }}>
            {count}
          </span>
        </div>
      )}

      {/* bottom: controls line, result, fallback targets */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-5">
        {phase === "result" && result && (
          <section className="ar-card pointer-events-auto w-full max-w-[620px] px-4 py-3" style={{ animation: "ar-card-in .35s var(--ease-out) both" }} aria-live="polite">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                {result.kind === "right" ? (
                  <p className="font-display text-[22px] text-success">
                    Direct hit! <span className="text-reward">+{result.points}</span>
                    {result.multiplier > 1 && <span className="ml-1 text-[16px] text-reward"> · ×{result.multiplier}</span>}
                    {result.wrongHits > 0 && <span className="ml-1 text-[14px] text-muted"> · {result.wrongHits} miss{result.wrongHits === 1 ? "" : "es"} first</span>}
                  </p>
                ) : (
                  <p className="font-display text-[22px] text-danger">{result.penalty ? "The penalty ran the clock out" : "Time up"}</p>
                )}
                {result.kind === "right" && result.explanation && <p className="mt-0.5 line-clamp-3 text-[14px] leading-snug text-muted">{result.explanation}</p>}
                {result.kind === "timeout" && <p className="mt-0.5 text-[14px] text-muted">No points. The right answer is in the After-Action Report.</p>}
              </div>
              <button ref={nextBtn} type="button" onClick={next} className="ar-btn ar-btn-primary shrink-0 px-5 py-2 text-[16px]">
                {finished ? "REPORT ▸" : `NEXT ROUND${nextIn !== null ? ` · ${nextIn}` : ""} ▸`}
              </button>
            </div>
            {locked && <p className="mt-1 text-center font-hud text-[15px] tracking-[0.15em] text-faint">SHOOT OR PRESS ENTER TO CONTINUE</p>}
          </section>
        )}

        {question && phase === "play" && (
          <div
            className={stageOk === false ? "pointer-events-auto grid w-full max-w-[620px] grid-cols-1 gap-2 min-[480px]:grid-cols-2" : "sr-only"}
            role="group"
            aria-label="Targets"
          >
            {question.options.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className="ar-option"
                style={{ ["--c" as string]: TARGET_COLOR[o.id] }}
                disabled={shattered.includes(o.id)}
                onClick={() => {
                  sfx.laser();
                  if (stageOk) stage.current?.run((s) => s.shootAt(o.id));
                  else sendHit(o.id);
                }}
              >
                <span className="ar-key" style={{ borderColor: TARGET_COLOR[o.id], color: TARGET_COLOR[o.id] }}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  {o.id} · {o.text}
                </span>
              </button>
            ))}
          </div>
        )}

        {(phase === "play" || phase === "countdown" || phase === "starting") && (
          <p className="ar-chip text-center text-[15px] tracking-[0.12em] text-muted">
            {controlsLine}
            {!touch && !locked && aimMode === "pointer" && (
              <button type="button" className="pointer-events-auto ml-2 text-signal underline-offset-4 hover:underline" onClick={() => resume("lock")}>
                LOCK MOUSE ▸
              </button>
            )}
          </p>
        )}
        {notice && (
          <p className="ar-chip text-center text-[15px] text-caution" role="status">
            {notice}
          </p>
        )}
      </div>

      {/* intro / ready */}
      {overlay && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#070914]/40 px-4">
          <section className="ar-card w-full max-w-[560px] p-5 text-center sm:p-6" style={{ animation: "ar-card-in .45s var(--ease-out) both" }} aria-label="Ready">
            {phase === "intro" ? (
              <>
                <p className="font-hud text-[16px] tracking-[0.3em] text-signal">TRAINING ARENA · {context.gameTitle.toUpperCase()}</p>
                <h1 className="mt-1 font-display text-[44px] leading-none text-accent sm:text-[56px]" style={{ textShadow: "0 0 24px rgba(255,77,109,.5)" }}>
                  ARENA
                </h1>
                <p className="mx-auto mt-3 max-w-[46ch] text-[15px] text-muted">
                  {total} questions, 20 s each. The question floats on the board; four targets drift in front of you. Shoot the right one. A wrong target shatters and costs 3 s and 25 points, but you can keep shooting.
                </p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <span className="ar-chip text-[15px] text-reward">3 in a row ×1.5 · 5 in a row ×2</span>
                  <span className="ar-chip text-[15px] text-danger">wrong hit −3 s</span>
                  <span className="ar-chip text-[15px] text-signal">pass: 7 of 10</span>
                </div>
                <p className="mt-3 font-hud text-[16px] tracking-[0.12em] text-faint">
                  {touch ? "TAP A TARGET TO SHOOT · DRAG TO LOOK AROUND" : "MOUSE TO AIM · CLICK TO SHOOT · WASD TO MOVE · ESC TO PAUSE · KEYS 1–4 SHOOT A TARGET"}
                </p>
              </>
            ) : (
              <>
                <p className="font-hud text-[16px] tracking-[0.3em] text-muted">
                  QUESTION {Math.min(position, total)} OF {total}
                </p>
                <h2 className="mt-1 font-display text-[34px] sm:text-[40px]">Ready?</h2>
              </>
            )}
            <div className="mt-4 flex flex-col items-center gap-2">
              <button ref={nextBtn} type="button" onClick={() => enter(touch ? "pointer" : "lock")} className="ar-btn ar-btn-primary px-10 py-3 text-[24px]" style={{ animation: "btn-bob 2.4s ease-in-out infinite" }}>
                {phase === "intro" ? "✛ ENTER ARENA ✛" : "NEXT ROUND ▸"}
              </button>
              {!touch && (
                <button type="button" onClick={() => enter("pointer")} className="text-[14px] text-muted underline-offset-4 hover:text-signal hover:underline">
                  Play without locking the mouse (click to aim)
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {/* pause */}
      {paused && phase !== "ending" && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-[#070914]/70 px-4 backdrop-blur-[2px]">
          <section className="ar-card w-full max-w-[440px] p-5 text-center" style={{ animation: "ar-card-in .3s var(--ease-out) both" }} aria-label="Paused">
            <p className="font-hud text-[16px] tracking-[0.3em] text-signal">ARENA</p>
            <h2 className="mt-1 font-display text-[40px] leading-none">PAUSED</h2>
            <p className="mx-auto mt-2 max-w-[38ch] text-[14px] text-muted">
              {phase === "play" ? "This question's clock keeps running on the server. Get back in quickly!" : "The next round waits for you."}
            </p>
            <div className="mt-4 flex flex-col items-center gap-2">
              {!touch && (
                <button type="button" autoFocus onClick={() => resume("lock")} className="ar-btn ar-btn-primary w-full max-w-[280px] px-6 py-2.5 text-[20px]">
                  RESUME ▸
                </button>
              )}
              <button type="button" onClick={() => resume("pointer")} className="ar-btn w-full max-w-[280px] px-6 py-2 text-[15px]">
                {touch ? "RESUME ▸" : "Resume with click-to-aim"}
              </button>
              <Link href={`/games/${context.gameId}`} className="mt-1 text-[14px] text-muted underline-offset-4 hover:text-text hover:underline">
                Leave the arena (reopen the Run from the Game page)
              </Link>
            </div>
          </section>
        </div>
      )}

      {phase === "ending" && (
        <div className="pointer-events-none absolute inset-x-0 top-[24%] z-30 text-center">
          <p className="font-display text-[52px] leading-none text-reward sm:text-[84px]" style={{ textShadow: "0 5px 0 rgba(0,0,0,.4), 0 0 34px rgba(255,216,77,.6)", animation: "ar-banner .8s var(--ease-snap) both" }}>
            ARENA CLEARED
          </p>
          <p className="mt-2 font-hud text-[22px] tracking-[0.2em] text-text" style={{ animation: "ar-fade-in .4s .5s both", textShadow: "0 2px 0 rgba(0,0,0,.5)" }}>
            {run.score.toLocaleString("en-US")} POINTS · {run.correctCount}/{total} · AFTER-ACTION REPORT INCOMING
          </p>
        </div>
      )}

      <p className="sr-only" aria-live="assertive">
        {announce}
      </p>
    </div>
  );
}
