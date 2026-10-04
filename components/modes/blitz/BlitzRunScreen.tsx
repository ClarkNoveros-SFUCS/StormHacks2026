"use client";
// The Blitz Run screen (/runs/[runId]) on the Run API. A neon arcade cabinet:
//   ready (GO ▶) → 3, 2, 1 on the beat → POST start-prompt (the one 60 s clock starts)
//   → a statement slides in → TRUE / FALSE (buttons, ← →, T / F) → POST answer
//   → correct: flash, +10 / +20, the combo meter fills (×2 from 5 in a row)
//   → wrong: screen glitch, "Nope −3 s · It's TRUE", combo resets
//   → the next statement is already in the response … → clock out (TIME!) or deck done
//   → /runs/[runId]/reveal.
// A synthesized beat (useBeat) pulses the whole cabinet. Spec: docs/design/modes/blitz.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { BLITZ_COMBO_AT, BLITZ_MS } from "@/lib/modes/blitz/rules";
import { burst } from "@/lib/motion/particles";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { BlitzAnswerResponse, BlitzRunState } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { Odometer } from "@/components/ui/Odometer";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { BLITZ_BPM, comboSegments } from "./beat";
import s from "./blitz.module.css";
import { useBeat } from "./useBeat";

type Phase = "ready" | "countdown" | "starting" | "play" | "over";
type Outgoing = { key: number; text: string; verdict: "right" | "wrong" };
type Pop = { key: number; text: string; tone: "good" | "bad" | "combo" };
type Feedback = { key: number; correct: boolean; truth: boolean; explanation: string | null };

const BEAT_MS = 60_000 / BLITZ_BPM;

type Props = {
  initial: BlitzRunState;
  context: { runId: string; gameId: string; gameTitle: string };
};

export function BlitzRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const rootRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(1);
  const busy = useRef(false);
  const timeoutBusy = useRef(false);
  const lastSpoken = useRef<number | null>(null);

  const startPhase: Phase = initial.startedAt && initial.statement ? "play" : "ready";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const [run, setRun] = useState(initial);
  const [remaining, setRemaining] = useState(() =>
    initial.deadlineAt ? Math.max(0, Math.min(BLITZ_MS, msUntil(initial.deadlineAt, { offset: initialOffset }))) : BLITZ_MS,
  );
  const [count, setCount] = useState<number | null>(null);
  const [pressed, setPressed] = useState<boolean | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing[]>([]);
  const [pops, setPops] = useState<Pop[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [glitchKey, setGlitchKey] = useState(0);
  const [glitching, setGlitching] = useState(false);
  const [goodKey, setGoodKey] = useState(0);
  const [cutKey, setCutKey] = useState(0);
  const [breakKey, setBreakKey] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

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

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const hot = phase === "play" && remaining <= 10_000;
  const comboHot = run.combo >= BLITZ_COMBO_AT;
  const layers = useMemo(() => ({ combo: comboHot, hot }), [comboHot, hot]);
  useBeat({ active: phase === "countdown" || phase === "starting" || phase === "play", bpm: BLITZ_BPM, layers, target: rootRef });

  // ------------------------------------------------------------------------------------
  // Start: 3, 2, 1 on the beat, then the clock

  const begin = () => {
    if (phaseRef.current !== "ready") return;
    sfx.unlock();
    go("countdown");
    [3, 2, 1].forEach((n, i) =>
      later(() => {
        setCount(n);
        sfx.drum("blip", sfx.audioNow() ?? 0, 880);
      }, i * BEAT_MS * 2),
    );
    later(() => {
      setCount(0);
      sfx.drum("blip", sfx.audioNow() ?? 0, 1760);
      startClock();
    }, 3 * BEAT_MS * 2);
  };

  const startClock = () => {
    go("starting");
    enqueue(async () => {
      try {
        const st = await runApi.startPrompt<BlitzRunState>(runId, clock.current);
        setCount(null);
        if (st.status !== "in_progress" || !st.statement) return finish(st);
        setRun(st);
        setRemaining(st.deadlineAt ? Math.max(0, msUntil(st.deadlineAt, clock.current)) : BLITZ_MS);
        lastSpoken.current = null;
        go("play");
        setAnnounce(`Go! 60 seconds. ${st.statement.text}`);
      } catch (e) {
        setCount(null);
        go("ready");
        onError(e);
      }
    });
  };

  // ------------------------------------------------------------------------------------
  // Answers

  const answer = (value: boolean) => {
    if (phaseRef.current !== "play" || busy.current || !run.statement) return;
    busy.current = true;
    setPressed(value);
    sfx.click();
    const position = run.position;
    enqueue(async () => {
      try {
        const res = await runApi.blitzAnswer(runId, { value, position }, clock.current);
        handle(res);
      } catch (e) {
        onError(e);
      } finally {
        busy.current = false;
        setPressed(null);
      }
    });
  };

  const handle = ({ result, state: next }: BlitzAnswerResponse) => {
    if ("timedOut" in result) return finish(next);
    const key = counter.current++;
    const text = run.statement?.text ?? "";
    setOutgoing((o) => [...o.slice(-2), { key, text, verdict: result.correct ? "right" : "wrong" }]);
    later(() => setOutgoing((o) => o.filter((x) => x.key !== key)), 420);
    setFeedback({ key, correct: result.correct, truth: result.isTrue, explanation: result.explanation });
    later(() => setFeedback((f) => (f?.key === key ? null : f)), 1500);

    if (result.correct) {
      const doubled = result.points > 10;
      sfx.correct(doubled ? 3 : 1);
      setGoodKey((k) => k + 1);
      addPop(`+${result.points}`, doubled ? "combo" : "good");
      if (result.combo === BLITZ_COMBO_AT) {
        addPop("COMBO ×2!", "combo");
        sfx.reward();
      }
      const r = scoreRef.current?.getBoundingClientRect();
      if (r) burst(r.left + r.width / 2, r.top + r.height / 2, { kind: "spark", count: doubled ? 22 : 12, spread: 260, colors: ["#3dfcff", "#f6ff3d", "#ff3df0", "#ffffff"] });
      setAnnounce(`Correct, plus ${result.points}.${result.combo >= BLITZ_COMBO_AT ? ` Combo ${result.combo}.` : ""}`);
    } else {
      sfx.wrong();
      sfx.error();
      setGlitchKey((k) => k + 1);
      setGlitching(true);
      later(() => setGlitching(false), 400);
      setCutKey((k) => k + 1);
      if (run.combo > 0) setBreakKey((k) => k + 1);
      addPop("−3 s", "bad");
      setAnnounce(`Nope, it's ${result.isTrue ? "true" : "false"}. Minus 3 seconds.`);
    }

    if (next.status !== "in_progress" || !next.statement) return finish(next);
    setRun(next);
    if (next.deadlineAt) setRemaining(Math.max(0, msUntil(next.deadlineAt, clock.current)));
  };

  const addPop = (text: string, tone: Pop["tone"]) => {
    const key = counter.current++;
    setPops((p) => [...p.slice(-3), { key, text, tone }]);
    later(() => setPops((p) => p.filter((q) => q.key !== key)), 950);
  };

  const finish = (next: BlitzRunState) => {
    if (phaseRef.current === "over") return;
    setRun(next);
    go("over");
    setRemaining(next.outcome === "deck_cleared" ? remaining : 0);
    if (next.outcome === "deck_cleared") sfx.levelUp();
    else sfx.timeout();
    setAnnounce(next.outcome === "deck_cleared" ? "Deck cleared!" : "Time!");
    later(() => router.push(next.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`), 1900);
  };

  // ------------------------------------------------------------------------------------
  // Errors and the clock

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

  const resync = () => {
    enqueue(async () => {
      try {
        const st = await runApi.state<BlitzRunState>(runId, clock.current);
        setNotice(null);
        if (st.status !== "in_progress") return finish(st);
        setRun(st);
        if (st.startedAt && st.statement && phaseRef.current !== "play") go("play");
      } catch (err) {
        if (err instanceof RunApiError && err.status === 0) later(resync, 2500);
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  const requestTimeout = () => {
    if (timeoutBusy.current) return;
    timeoutBusy.current = true;
    enqueue(async () => {
      if (phaseRef.current !== "play") return;
      try {
        const st = await runApi.timeout<BlitzRunState>(runId, clock.current);
        if (st.status !== "in_progress") return finish(st);
        setRun(st);
        later(() => {
          timeoutBusy.current = false;
        }, 300);
      } catch (e) {
        timeoutBusy.current = false;
        onError(e);
      }
    });
  };

  const onTick = useEffectEvent(() => {
    if (phaseRef.current !== "play" || !run.deadlineAt) return;
    const rem = Math.min(BLITZ_MS, msUntil(run.deadlineAt, clock.current));
    setRemaining(Math.max(0, rem));
    const sec = Math.ceil(Math.max(0, rem) / 1000);
    if (sec !== lastSpoken.current && sec > 0 && (sec % 10 === 0 || sec <= 5)) {
      lastSpoken.current = sec;
      setAnnounce(`${sec} seconds left`);
    }
    if (rem <= 0) requestTimeout();
  });

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase]);

  // Keys: ← / F false, → / T true; Enter or Space on the ready screen starts
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (phaseRef.current === "ready" && (k === "enter" || k === " ") && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
      e.preventDefault();
      begin();
      return;
    }
    if (phaseRef.current !== "play") return;
    if (k === "arrowright" || k === "t") {
      e.preventDefault();
      answer(true);
    } else if (k === "arrowleft" || k === "f") {
      e.preventDefault();
      answer(false);
    }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ------------------------------------------------------------------------------------
  // Render

  const secs = phase === "ready" || phase === "countdown" || phase === "starting" ? 60 : Math.ceil(remaining / 1000);
  const frac = phase === "ready" || phase === "countdown" || phase === "starting" ? 1 : Math.max(0, Math.min(1, remaining / BLITZ_MS));
  const lit = comboSegments(run.combo, BLITZ_COMBO_AT);
  const statement = run.statement;

  return (
    <div ref={rootRef} data-theme="blitz" className={`${s.cabinet} font-sans`}>
      <div className={s.stars} aria-hidden="true" />
      <div className={s.sun} aria-hidden="true" />
      <div className={s.floor} aria-hidden="true" />

      <div className={`relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[860px] flex-col px-4 pt-3 pb-[max(14px,env(safe-area-inset-bottom))] sm:px-6 sm:pt-5 ${glitching ? s.glitch : ""}`}>
        {/* HUD */}
        <header className="flex items-start gap-2 sm:gap-4">
          <Link
            href={`/games/${context.gameId}`}
            className={`${s.hudBox} grid h-10 w-10 shrink-0 place-items-center font-hud text-[20px] text-muted hover:text-text`}
            aria-label={`Leave to ${context.gameTitle}`}
            title="Leave (the clock keeps running)"
          >
            ◂
          </Link>
          <div ref={scoreRef} className={`${s.hudBox} relative flex min-w-[96px] flex-col px-3 py-1 sm:min-w-[140px]`} aria-label={`Score ${run.score}`}>
            <span className="font-hud text-[12px] tracking-[0.3em] text-muted">SCORE</span>
            <Odometer value={run.score} duration={450} className={`font-hud text-[30px] leading-none sm:text-[38px] ${s.neonYellow}`} />
            {pops.map((p) => (
              <span
                key={p.key}
                className={`${s.pop} top-full left-1/2 text-[28px] sm:text-[34px] ${p.tone === "bad" ? "" : p.tone === "combo" ? s.neonYellow : s.neonCyan}`}
                style={p.tone === "bad" ? { color: "#ffd6df", textShadow: "0 0 12px var(--danger), 0 0 24px var(--danger)" } : undefined}
              >
                {p.text}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <span
              key={`cut${cutKey}`}
              className={`font-hud text-[52px] leading-[0.9] tabular-nums sm:text-[68px] ${s.neonPink} ${hot ? s.clockHot : ""} ${cutKey > 0 ? s.clockCut : ""}`}
              aria-hidden="true"
            >
              {secs}
            </span>
            <div className={`${s.timeBar} mt-1 w-full max-w-[260px]`} role="timer" aria-label={`${secs} seconds left`}>
              <div className={s.timeFill} style={{ width: `${frac * 100}%`, background: hot ? "var(--danger)" : undefined }} />
            </div>
          </div>
          <div className={`${s.hudBox} flex min-w-[96px] flex-col px-3 py-1.5 sm:min-w-[140px]`} aria-label={`Combo ${run.combo}`}>
            <div key={`b${breakKey}`} className={`flex items-center justify-between gap-2 ${breakKey > 0 ? s.comboBreak : ""}`}>
              <span className="font-hud text-[12px] tracking-[0.3em] text-muted">COMBO</span>
              <span className={`font-hud text-[18px] leading-none ${comboHot ? s.neonYellow : "text-muted"}`}>{run.combo}</span>
            </div>
            <div className="mt-1.5 flex gap-1">
              {Array.from({ length: BLITZ_COMBO_AT }, (_, i) => (
                <span key={i} className={`${s.seg} ${i < lit ? (comboHot ? s.segHot : s.segOn) : ""}`} />
              ))}
            </div>
            <span className={`mt-1 h-[22px] font-hud text-[20px] leading-none ${comboHot ? `${s.x2} ${s.neonYellow}` : "text-faint"}`}>
              {comboHot ? "COMBO ×2" : `${BLITZ_COMBO_AT - lit} TO ×2`}
            </span>
          </div>
          <SoundToggle className="hidden shrink-0 sm:grid" />
        </header>

        {/* the statement */}
        <main className="flex flex-1 flex-col justify-center py-6">
          <p className="mb-3 text-center font-hud text-[16px] tracking-[0.35em] text-muted">
            {phase === "play" ? `STATEMENT ${run.position}` : " "}
          </p>
          <div className={`${s.stage} mx-auto w-full max-w-[680px]`}>
            {outgoing.map((o) => (
              <div key={o.key} aria-hidden="true" className={`${s.card} ${o.verdict === "right" ? s.cardOutRight : s.cardOutWrong}`}>
                <p className="text-center font-display text-[22px] leading-snug sm:text-[28px]">{o.text}</p>
              </div>
            ))}
            {phase === "play" && statement && (
              <div key={run.position} className={`${s.card} ${s.cardIn}`}>
                <p className="text-center font-display text-[22px] leading-snug sm:text-[28px]">{statement.text}</p>
              </div>
            )}
          </div>
          <div className="mt-4 min-h-[52px] text-center" aria-hidden="true">
            {feedback && phase === "play" && (
              <p key={feedback.key} className="font-hud text-[22px] tracking-[0.12em]" style={{ animation: "rise-in .25s var(--ease-out) both" }}>
                {feedback.correct ? (
                  <span className={s.neonCyan}>RIGHT · IT&apos;S {feedback.truth ? "TRUE" : "FALSE"}</span>
                ) : (
                  <span className={s.rgbSplit} style={{ color: "#ffd6df" }}>
                    NOPE −3 s · IT&apos;S {feedback.truth ? "TRUE" : "FALSE"}
                  </span>
                )}
              </p>
            )}
          </div>
        </main>

        {/* TRUE / FALSE */}
        <div className="grid grid-cols-2 gap-4 sm:gap-6">
          <button type="button" data-value="false" data-pressed={pressed === false} disabled={phase !== "play"} onClick={() => answer(false)} className={`${s.answer} rounded-md`}>
            <span className="text-[38px] leading-none sm:text-[46px]">FALSE</span>
            <span className="text-[14px] tracking-[0.3em] text-white/70">◀ · F</span>
          </button>
          <button type="button" data-value="true" data-pressed={pressed === true} disabled={phase !== "play"} onClick={() => answer(true)} className={`${s.answer} rounded-md`}>
            <span className="text-[38px] leading-none sm:text-[46px]">TRUE</span>
            <span className="text-[14px] tracking-[0.3em] text-white/70">T · ▶</span>
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between sm:hidden">
          <span className="font-hud text-[14px] tracking-[0.25em] text-faint">{context.gameTitle}</span>
          <SoundToggle />
        </div>
        {notice && (
          <p className="mt-2 text-center font-hud text-[18px] text-caution" role="alert">
            {notice}
          </p>
        )}
      </div>

      {goodKey > 0 && <div key={`ok${goodKey}`} className={s.flashGood} aria-hidden="true" />}
      {glitchKey > 0 && <div key={`bad${glitchKey}`} className={s.flashBad} aria-hidden="true" />}

      {/* Ready / countdown / over */}
      {(phase === "ready" || phase === "countdown" || phase === "starting") && (
        <div className={s.overlay}>
          {phase === "ready" ? (
            <div className="flex max-w-[520px] flex-col items-center text-center">
              <p className={`${s.title} ${s.neonPink} ${s.flicker} text-[96px] sm:text-[132px]`}>BLITZ</p>
              <p className="mt-2 font-hud text-[20px] tracking-[0.2em] text-muted">{context.gameTitle}</p>
              <ul className="mt-5 grid grid-cols-2 gap-2 font-hud text-[18px] tracking-[0.08em] sm:grid-cols-4">
                <li className={s.neonCyan}>60 s</li>
                <li className={s.neonCyan}>+10 RIGHT</li>
                <li className={s.neonYellow}>×2 AT 5</li>
                <li style={{ color: "#ffd6df", textShadow: "0 0 10px var(--danger)" }}>−3 s WRONG</li>
              </ul>
              <p className="mt-4 font-sans text-[14px] text-muted">True or false, from your notes. As many as you can.</p>
              <button type="button" autoFocus onClick={begin} className={`${s.answer} mt-7 h-[76px] w-[220px] rounded-md`} data-value="true">
                <span className="text-[40px] leading-none">GO ▶</span>
              </button>
              <p className="mt-4 hidden font-hud text-[15px] tracking-[0.2em] text-faint sm:block">ENTER TO START · ← FALSE · TRUE → · OR F / T</p>
            </div>
          ) : (
            <p key={count ?? "go"} className={`${s.count} ${count ? s.neonPink : s.neonYellow} text-[160px] sm:text-[220px]`} aria-live="assertive">
              {count ? count : "GO!"}
            </p>
          )}
        </div>
      )}
      {phase === "over" && (
        <div className={s.overlay}>
          <div className="text-center">
            <p className={`${s.count} ${run.outcome === "deck_cleared" ? s.neonYellow : s.neonPink} text-[88px] sm:text-[128px]`}>{run.outcome === "deck_cleared" ? "DECK CLEARED" : "TIME!"}</p>
            <p className="mt-2 font-hud text-[22px] tracking-[0.3em] text-muted" style={{ animation: "title-flicker 1.6s ease-in-out infinite" }}>
              {run.correctCount} RIGHT · {run.wrongCount} WRONG
            </p>
          </div>
        </div>
      )}

      <div className={s.vignette} aria-hidden="true" />
      <div className={s.scan} aria-hidden="true" />
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
