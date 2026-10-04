"use client";
// The Apogee Run screen (/runs/[runId] for an Apogee Game): Dive's rules and API in space, a
// React + three.js port of inspo/krillion-space-variant/apogee.html.
//   intro (LAUNCH) → 3 · 2 · 1 · LIFTOFF → the console slides up → POST start-prompt → play
//   → guess / hint / timeout → correct: engine burn, the rocket climbs (1 km per point), then the
//   tier reveal (CONTINUE ▲ / Enter / auto ~6 s) → next console … → after Prompt 7: coast to the
//   Mission Report (/runs/[runId]/reveal).
// The server owns the clock and the score; the clock is paused during the tier reveal because
// start-prompt is only called after it. Spec: docs/design/modes/apogee.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { PROMPT_MS } from "@/lib/modes/dive/rules";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { DiveRunState, GuessResponse, GuessResult, PromptKind, PromptOutcome } from "@/lib/runs/types";
import { HINTED_COMMON_POINTS, TIER_BELOW, type Tier } from "@/lib/scoring/tiers";
import { sfx, type Band } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { OptionGrid } from "@/components/round/OptionGrid";
import { OrderList } from "@/components/round/OrderList";
import { AltitudeRuler } from "./AltitudeRuler";
import { APOGEE_TIER_ORDER, APOGEE_TIERS, LANDMARKS, zoneText, type TierKey } from "./altitude";
import { ApogeeStage, type ApogeeStageHandle } from "./ApogeeStage";
import { apogeeFontVars } from "./fonts";
import { LiveValue } from "./live";
import { TierReveal } from "./TierReveal";
import "./apogee.css";

const ENTER_MS = 600;
const KIND_LABEL: Record<PromptKind, string> = {
  open: "Open · many answers",
  cloze: "Fill the blank",
  definition_to_term: "Name the term",
  ordered_recall: "Put in order · one try",
  odd_one_out: "Odd one out · one try",
  multiple_choice: "Pick one",
  true_false: "True or false",
};

type Phase = "intro" | "countdown" | "entering" | "play" | "burning" | "tier" | "resolving" | "ending";
type Burn = { key: number; text: string; tier: Tier; points: number; stale: boolean; hinted: boolean; altitude: number };

type Props = {
  initial: DiveRunState;
  context: {
    runId: string;
    gameId: string;
    gameTitle: string;
    closed: { position: number; outcome: PromptOutcome; points: number }[];
  };
};

/** A closed Prompt's Tier from its points (a reload only knows the points). */
function tierFromPoints(points: number): TierKey {
  if (points <= 0) return "miss";
  if (points >= 100) return "rare";
  if (points >= 30) return "deep";
  if (points >= 12) return "solid";
  return "common";
}

function pipsFrom(closed: Props["context"]["closed"]): (TierKey | undefined)[] {
  const out: (TierKey | undefined)[] = [];
  for (const c of closed) out[c.position - 1] = c.outcome === "correct" ? tierFromPoints(c.points) : "miss";
  return out;
}

/** Prompt text with `____` drawn as a flame-orange blank. */
function PromptText({ text }: { text: string }) {
  const parts = text.split(/_{3,}/);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {p}
          {i < parts.length - 1 && <span className="ap-blank" aria-label="blank" />}
        </span>
      ))}
    </>
  );
}

export function ApogeeRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const stage = useRef<ApogeeStageHandle>(null);
  const [live] = useState(() => new LiveValue(initial.score));
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(1);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<DiveRunState | null>(null);
  const timeoutBusy = useRef(false);
  const popRef = useRef<HTMLDivElement>(null);
  const popUntil = useRef(0);
  const altRef = useRef<HTMLSpanElement>(null);
  const zoneRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fresh = initial.position === 1 && !initial.prompt?.startedAt && context.closed.length === 0 && initial.score === 0;
  const startPhase: Phase = fresh ? "intro" : initial.prompt?.startedAt ? "play" : "entering";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const posRef = useRef(initial.position);
  const [run, setRun] = useState(initial);
  const [score, setScore] = useState(initial.score);
  const [pips, setPips] = useState(() => pipsFrom(context.closed));
  const [remaining, setRemaining] = useState(() =>
    initial.prompt?.deadlineAt ? Math.max(0, Math.min(PROMPT_MS, msUntil(initial.prompt.deadlineAt, { offset: initialOffset }))) : PROMPT_MS,
  );
  const [count, setCount] = useState<string | null>(null);
  const consoleRef = useRef<HTMLElement>(null);
  const shake = () => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    consoleRef.current?.animate(
      [{ translate: "0" }, { translate: "-9px" }, { translate: "8px" }, { translate: "-5px" }, { translate: "3px" }, { translate: "0" }],
      { duration: 380 },
    );
  };
  const [pop, setPop] = useState<{ key: number; text: string; sub: string; color: string; minus: boolean } | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; bad: boolean } | null>(null);
  const [result, setResult] = useState<{ head: string; color: string; text: string; note: string } | null>(null);
  const [burn, setBurn] = useState<Burn | null>(null);
  const [order, setOrder] = useState<string[]>(initial.prompt?.items ?? []);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rightOption, setRightOption] = useState<string | null>(null);
  const [rightOrder, setRightOrder] = useState<string[] | null>(null);
  const [hintAsked, setHintAsked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<{ key: number; name: string; real: string; note: string } | null>(null);

  const prompt = run.prompt;
  const position = run.position;
  const total = run.promptCount;

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
  const markPip = (t: TierKey) => {
    const i = posRef.current - 1;
    setPips((xs) => {
      const n = [...xs];
      n[i] = t;
      return n;
    });
  };
  const showPop = (text: string, sub: string, color: string, minus = false) => {
    popUntil.current = performance.now() + (minus ? 900 : 1700);
    setPop({ key: counter.current++, text, sub, color, minus });
  };

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach(clearTimeout);
  }, []);

  // ------------------------------------------------------------------------------------
  // The scene feeds the HUD every frame (no React re-renders)

  const onFrame = useCallback(
    (f: { points: number; popX: number; popY: number }) => {
      live.set(f.points);
      const el = popRef.current;
      if (el && performance.now() < popUntil.current) {
        el.style.left = `${f.popX}px`;
        el.style.top = `${f.popY}px`;
      }
    },
    [live],
  );
  const onLandmark = useCallback((i: number) => {
    const l = LANDMARKS[i];
    setToast({ key: counter.current++, name: l.name, real: l.stylised ? `real: ${l.real}` : l.real, note: l.note });
  }, []);

  useEffect(
    () =>
      live.subscribe((p) => {
        if (altRef.current) altRef.current.textContent = Math.round(p).toLocaleString("en-US");
        if (zoneRef.current) zoneRef.current.textContent = zoneText(p);
      }),
    [live],
  );

  // ------------------------------------------------------------------------------------
  // Launch

  const launch = () => {
    if (phaseRef.current !== "intro") return;
    sfx.click();
    go("countdown");
    const steps: [string, number][] = [
      ["3", 850],
      ["2", 850],
      ["1", 850],
      ["LIFTOFF", 700],
    ];
    let at = 0;
    for (const [label, ms] of steps) {
      later(() => {
        setCount(label);
        if (label === "LIFTOFF") sfx.whoosh();
        else sfx.ping();
        if (label === "1") stage.current?.run((s) => s.countdown());
      }, at);
      at += ms;
    }
    later(() => {
      setCount(null);
      stage.current?.run((s) => s.liftoff(0));
    }, at);
    later(() => go("entering"), at + 1300);
  };

  // ------------------------------------------------------------------------------------
  // Moving between Prompts

  const advance = () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    if (next.status !== "in_progress" || !next.prompt) {
      go("ending");
      stage.current?.run((s) => s.coast());
      sfx.whoosh();
      later(() => router.push(next.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`), 1400);
      return;
    }
    posRef.current = next.position;
    timeoutBusy.current = false;
    setRun(next);
    setOrder(next.prompt.items ?? []);
    setPicked(null);
    setLocked(false);
    setRightOption(null);
    setRightOrder(null);
    setHintAsked(false);
    setFeedback(null);
    setResult(null);
    setBurn(null);
    setRemaining(PROMPT_MS);
    go(next.prompt.startedAt ? "play" : "entering");
  };

  const requestTimeout = () => {
    if (timeoutBusy.current) return;
    timeoutBusy.current = true;
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) return;
      try {
        const s = await runApi.timeout<DiveRunState>(runId, clock.current);
        if (phaseRef.current !== "play" || posRef.current !== pos) return;
        if (s.status !== "in_progress" || s.position !== pos) return failTimeout(s);
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
  // Outcomes

  const succeed = (r: Extract<GuessResult, { correct: true }>, next: DiveRunState) => {
    const p = run.prompt!;
    const single = p.kind !== "open";
    const hinted = single && p.hintUsed;
    const scored: Tier = hinted ? (TIER_BELOW[r.tier] ?? "common") : r.tier;
    const ui = APOGEE_TIERS[scored];
    pending.current = next;
    sfx.correct(ui.band as Band);
    setLocked(true);
    setFeedback(null);
    if (p.kind === "odd_one_out") setRightOption(r.answer);
    const text = p.kind === "ordered_recall" ? "All in order" : r.answer;
    setScore(next.score);
    markPip(scored);
    showPop(`+${r.points}`, `${ui.label} · ${text}`, ui.hex);
    setResult({ head: `+${r.points}`, color: ui.hex, text, note: ui.verdict });
    stage.current?.run((s) => s.burn(next.score, ui.burn, ui.hex));
    setBurn({ key: counter.current++, text, tier: scored, points: r.points, stale: r.stale, hinted, altitude: next.score });
    go("burning");
    later(() => go("tier"), 1500);
  };

  const fail = (next: DiveRunState, o: { head: string; text: string; note: string; ms: number }) => {
    pending.current = next;
    go("resolving");
    setLocked(true);
    shake();
    setResult({ head: o.head, color: "var(--danger)", text: o.text, note: o.note });
    markPip("miss");
    later(advance, o.ms);
  };

  const failTimeout = (next: DiveRunState) => {
    sfx.timeout();
    setRemaining(0);
    stage.current?.run((s) => s.stall());
    fail(next, { head: "Lost signal", text: "Time's up", note: "Engines idle. No altitude for this one; the answers are in the Mission Report.", ms: 2000 });
  };

  const handleGuess = ({ result: r, state: next }: GuessResponse, text: string) => {
    if ("timedOut" in r) return failTimeout(next);
    if (r.correct) return succeed(r, next);
    if ("penaltyMs" in r) {
      sfx.wrong();
      shake();
      showPop("−3 s", "off course", "#ff5468", true);
      stage.current?.run((s) => s.misfire());
      setFeedback({ text: `“${text}” isn't in your notes · off course −3 s`, bad: true });
      if (next.status !== "in_progress" || next.position !== posRef.current) return failTimeout(next);
      setRun(next);
      return;
    }
    sfx.wrong();
    stage.current?.run((s) => s.misfire());
    if (r.correctOrder) setRightOrder(r.correctOrder);
    else setRightOption(r.answer);
    fail(next, { head: "Off course", text: r.correctOrder ? "The right order is marked" : `It was ${r.answer}`, note: "One try on this kind. The Run carries on.", ms: 2600 });
  };

  const onError = (e: unknown) => {
    if (e instanceof RunApiError && e.status === 401) {
      setNotice("You're signed out. Sign in again to keep flying.");
      return;
    }
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
        const s = await runApi.state<DiveRunState>(runId, clock.current);
        setNotice(null);
        const ph = phaseRef.current;
        if (s.status !== "in_progress" || s.position !== posRef.current) {
          if (ph === "play" || ph === "entering") failTimeout(s);
          else if (pending.current) pending.current = s;
          return;
        }
        setRun(s);
        if (ph === "entering" && s.prompt?.startedAt) go("play");
      } catch (err) {
        if (err instanceof RunApiError && err.status === 0) later(resync, 2500);
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  // ------------------------------------------------------------------------------------
  // Player input

  const send = (body: { text: string } | { option: string } | { order: string[] }, label: string) => {
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) return;
      try {
        const res = await runApi.guess(runId, { ...body, position: pos }, clock.current);
        if (phaseRef.current !== "play" || posRef.current !== pos) return;
        handleGuess(res, label);
      } catch (e) {
        if (!("text" in body)) setLocked(false);
        onError(e);
      }
    });
  };

  const submitTyped = (e: FormEvent) => {
    e.preventDefault();
    const el = inputRef.current;
    const text = el?.value.trim() ?? "";
    if (!text || phaseRef.current !== "play") return;
    if (el) el.value = "";
    sfx.click();
    send({ text }, text);
  };

  const pickOption = (o: string) => {
    if (phaseRef.current !== "play" || prompt?.kind !== "odd_one_out" || locked) return;
    setPicked(o);
    setLocked(true);
    send({ option: o }, o);
  };

  const lockOrder = () => {
    if (phaseRef.current !== "play" || prompt?.kind !== "ordered_recall" || locked) return;
    sfx.click();
    setLocked(true);
    send({ order }, order.join(" → "));
  };

  const takeHint = () => {
    if (phaseRef.current !== "play" || !prompt?.hintAvailable || prompt.hintUsed || hintAsked) return;
    sfx.click();
    setHintAsked(true);
    const pos = posRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || posRef.current !== pos) return;
      try {
        const res = await runApi.hint(runId, clock.current);
        if (phaseRef.current !== "play" || posRef.current !== pos) return;
        setRun(res.state);
      } catch (e) {
        setHintAsked(false);
        onError(e);
      }
    });
  };

  // ------------------------------------------------------------------------------------
  // Effects

  const startClock = useEffectEvent(async () => {
    const pos = posRef.current;
    try {
      const s = await runApi.startPrompt<DiveRunState>(runId, clock.current);
      if (posRef.current !== pos || phaseRef.current !== "entering") return;
      if (s.status !== "in_progress" || s.position !== pos) return failTimeout(s);
      setRun(s);
      go("play");
    } catch (e) {
      onError(e);
    }
  });

  useEffect(() => {
    if (phase !== "entering") return;
    const id = setTimeout(() => void startClock(), ENTER_MS);
    return () => clearTimeout(id);
  }, [phase, position]);

  // Focus the answer box when a typed Prompt goes live (fine pointers only: no surprise keyboards on phones).
  useEffect(() => {
    if (phase === "play" && window.matchMedia?.("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
  }, [phase, position]);

  const onTick = useEffectEvent(() => {
    if (phaseRef.current !== "play" || !prompt?.deadlineAt) return;
    const rem = Math.min(PROMPT_MS, msUntil(prompt.deadlineAt, clock.current));
    setRemaining(Math.max(0, rem));
    if (rem <= 0) requestTimeout();
  });

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase, position]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    if (phaseRef.current === "intro" && e.key === "Enter" && el?.tagName !== "BUTTON" && el?.tagName !== "A") {
      e.preventDefault();
      launch();
      return;
    }
    if (phaseRef.current !== "play" || !prompt || typing) return;
    if (prompt.kind === "odd_one_out" && prompt.options) {
      const i = "1234".indexOf(e.key) !== -1 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && i < prompt.options.length) {
        e.preventDefault();
        pickOption(prompt.options[i]);
      }
    } else if (prompt.kind === "ordered_recall" && e.key === "Enter" && el?.tagName !== "BUTTON") {
      e.preventDefault();
      lockOrder();
    }
  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ------------------------------------------------------------------------------------
  // Render

  const playing = phase === "play";
  const single = !!prompt && prompt.kind !== "open";
  const baseTier = single ? (prompt?.tier ?? null) : null;
  const tierNow: Tier | null = baseTier ? (prompt?.hintUsed ? (TIER_BELOW[baseTier] ?? "common") : baseTier) : null;
  const consoleUp = !!prompt && (phase === "entering" || phase === "play" || phase === "burning" || phase === "resolving");
  const secs = remaining / 1000;
  const low = playing && remaining < 6000;
  const hintCost = baseTier ? `${APOGEE_TIERS[baseTier].label} → ${TIER_BELOW[baseTier] ? APOGEE_TIERS[TIER_BELOW[baseTier]!].label : `${HINTED_COMMON_POINTS} km`}` : "";

  return (
    <div data-theme="apogee" className={`ap-root ${apogeeFontVars} relative isolate h-[100dvh] w-full overflow-hidden font-sans`}>
      <ApogeeStage ref={stage} initialPoints={initial.score} lifted={!fresh} onFrame={onFrame} onLandmark={onLandmark} />

      {/* top HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 px-3 pt-3 sm:px-5 sm:pt-4" style={{ textShadow: "0 1px 10px rgba(4,5,12,.55)" }}>
        <div className="pointer-events-auto flex min-w-0 items-start gap-2 sm:gap-3">
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => {
              sfx.click();
              setMenuOpen((o) => !o);
            }}
            className="ap-btn grid h-9 w-9 shrink-0 place-items-center !p-0"
          >
            <PixelIcon name="menu" size={16} />
          </button>
          <div className="min-w-0">
            <b className="block font-display text-[22px] leading-[0.9] font-black tracking-[0.06em] sm:text-[30px]">APOGEE</b>
            <span className="hidden max-w-[28ch] truncate text-[12px] text-muted sm:block">{context.gameTitle}</span>
          </div>
        </div>
        <div className="flex gap-1 pt-3 sm:gap-1.5" aria-label={`Prompt ${position} of ${total}`} role="img">
          {Array.from({ length: total }, (_, i) => {
            const t = pips[i];
            const now = !t && i === position - 1 && phase !== "intro";
            const bg = t ? (t === "miss" ? "rgba(255,84,104,.55)" : APOGEE_TIERS[t].hex) : now ? "var(--text)" : "rgba(255,255,255,.12)";
            return <div key={i} className="h-1.5 w-3.5 rounded-full transition-colors duration-300 sm:w-[26px]" style={{ background: bg, boxShadow: t === "rare" ? `0 0 10px ${APOGEE_TIERS.rare.hex}` : undefined }} />;
          })}
        </div>
        <div className="flex items-start gap-2">
          <div className="text-right" aria-live="off">
            <div className="font-display text-[26px] leading-[0.95] font-extrabold tracking-[0.02em] sm:text-[34px]">
              <span ref={altRef}>{initial.score}</span>
              <small className="ml-1 text-[16px] text-muted sm:text-[18px]">km</small>
            </div>
            <span ref={zoneRef} className="hidden text-[12px] whitespace-nowrap text-muted sm:block">
              {zoneText(initial.score)}
            </span>
            <span className="block font-hud text-[12px] text-accent sm:text-[13px]" aria-live="polite">
              {score} pts
            </span>
          </div>
          <div className="pointer-events-auto">
            <SoundToggle />
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className="ap-glass absolute top-16 left-3 z-30 w-[min(340px,calc(100%-1.5rem))] p-4 sm:left-5" style={{ animation: "pop-in .3s var(--ease-snap) both" }}>
          <p className="ap-eyebrow">in flight</p>
          <p className="mt-1 truncate font-display text-[22px] font-extrabold">{context.gameTitle}</p>
          <p className="mt-2 text-[13px] leading-snug text-muted">The clock keeps running while this menu is open. Leaving ends nothing: reopen the Run from the Game page.</p>
          <div className="mt-3 flex flex-col gap-1.5 text-[15px]">
            <button type="button" onClick={() => setMenuOpen(false)} className="text-left font-semibold text-accent hover:underline">
              ▸ Back to the flight
            </button>
            <Link href={`/games/${context.gameId}`} className="text-muted hover:text-text hover:underline">
              ▸ Return to the Game page
            </Link>
          </div>
        </div>
      )}

      {/* altitude ruler */}
      <AltitudeRuler live={live} className="absolute top-[104px] right-2 bottom-[54%] z-[5] w-[14px] md:top-[116px] md:right-[18px] md:bottom-[230px] md:w-[150px]" />

      {/* landmark toast */}
      {toast && (
        <div key={toast.key} className="ap-glass pointer-events-none absolute top-[78px] left-1/2 z-20 flex items-baseline gap-3 px-4 py-2 whitespace-nowrap sm:top-[86px]" style={{ animation: "ap-toast 2.6s ease forwards" }} role="status">
          <b className="font-display text-[20px] font-extrabold tracking-[0.04em] sm:text-[22px]">{toast.name}</b>
          <span className="font-hud text-[11px] text-accent sm:text-[12px]">
            {toast.real} · {toast.note}
          </span>
        </div>
      )}

      {/* the score pop, anchored over the rocket's nose */}
      <div ref={popRef} className="pointer-events-none absolute top-1/2 left-1/2 z-[15] text-center whitespace-nowrap" aria-hidden="true">
        {pop && (
          <div key={pop.key} style={{ animation: `ap-pop ${pop.minus ? 900 : 1700}ms cubic-bezier(.2,.8,.2,1) forwards`, color: pop.color }}>
            <div className="font-display leading-none font-black tracking-[0.02em]" style={{ fontSize: pop.minus ? 34 : 56, textShadow: "0 0 24px currentColor" }}>
              {pop.text}
            </div>
            <div className="font-hud text-[12px] tracking-[0.12em] uppercase">{pop.sub}</div>
          </div>
        )}
      </div>

      {/* intro */}
      {(phase === "intro" || phase === "countdown") && (
        <section
          className="ap-glass absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-20 flex w-[min(430px,calc(100%-2rem))] flex-col gap-4 p-5 transition-all duration-500 sm:top-1/2 sm:bottom-auto sm:left-8 sm:-translate-y-1/2 sm:p-6"
          style={{ opacity: phase === "countdown" ? 0 : 1, transform: phase === "countdown" ? "translateX(-40px)" : undefined, pointerEvents: phase === "countdown" ? "none" : undefined }}
          aria-label="Apogee"
        >
          <p className="ap-eyebrow">Apogee · {context.gameTitle}</p>
          <h1 className="font-display text-[64px] leading-[0.82] font-black tracking-[0.03em] sm:text-[88px]">
            APO<span className="text-accent">GEE</span>
          </h1>
          <p className="leading-relaxed text-[#cfd3e6]">Every right answer is fuel. Obvious answers get you off the ground; the rarest ones from your notes burn hot enough to reach the Moon.</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              ["7", "prompts per Run"],
              ["25 s", "on each clock"],
              ["−3 s", "per wrong guess"],
            ].map(([b, s]) => (
              <div key={s} className="rounded-[10px] border border-border bg-white/[.04] p-2.5">
                <b className="block font-display text-[26px] leading-none font-extrabold">{b}</b>
                <span className="text-[12px] text-muted">{s}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {APOGEE_TIER_ORDER.map((t) => (
              <div key={t} className="border-t-2 pt-1.5" style={{ color: APOGEE_TIERS[t].hex, borderColor: APOGEE_TIERS[t].hex }}>
                <b className="block font-hud text-[13px]">{APOGEE_TIERS[t].points} km</b>
                <span className="text-[11px] text-muted">{APOGEE_TIERS[t].label}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={launch} className="ap-btn ap-btn-primary ap-btn-big" autoFocus>
            LAUNCH
          </button>
          <p className="text-[12px] text-muted">Enter launches · drag to look around · scroll or pinch to zoom</p>
        </section>
      )}

      {/* countdown */}
      {count && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center" aria-live="assertive">
          <span key={count} className="font-display leading-none font-black text-text" style={{ fontSize: "clamp(90px, 18vw, 200px)", textShadow: "0 0 40px rgba(255,106,43,.6)", animation: "ap-tick .9s ease-out forwards" }}>
            {count}
          </span>
        </div>
      )}

      {/* the prompt console */}
      {prompt && (
        <section
          key={position}
          ref={consoleRef}
          className="ap-glass absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-1/2 z-20 flex max-h-[62dvh] w-[min(640px,calc(100%-24px))] flex-col gap-3 overflow-y-auto p-3.5 transition-[transform,opacity] duration-500 sm:bottom-[18px] sm:gap-3 sm:p-5"
          style={{
            animation: phase === "entering" ? "ap-console-in .55s cubic-bezier(.2,.8,.2,1) both" : undefined,
            transform: consoleUp ? "translate(-50%, 0)" : "translate(-50%, 130%)",
            opacity: consoleUp ? 1 : 0,
            pointerEvents: consoleUp ? undefined : "none",
            transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)",
          }}
          aria-label={`Prompt ${position} of ${total}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ap-eyebrow">
                {position} / {total} · {KIND_LABEL[prompt.kind]}
              </span>
              {prompt.kind === "open" ? (
                APOGEE_TIER_ORDER.map((t) => (
                  <span key={t} className="ap-chip" style={{ color: APOGEE_TIERS[t].hex }} title={APOGEE_TIERS[t].label}>
                    {APOGEE_TIERS[t].points}
                  </span>
                ))
              ) : baseTier && tierNow ? (
                <span className="ap-chip" style={{ color: APOGEE_TIERS[tierNow].hex }}>
                  {prompt.hintUsed ? (
                    <>
                      <s className="opacity-55">{APOGEE_TIERS[baseTier].label}</s> → {TIER_BELOW[baseTier] ? `${APOGEE_TIERS[tierNow].label} · ${APOGEE_TIERS[tierNow].points}` : `${HINTED_COMMON_POINTS} km`}
                    </>
                  ) : (
                    `${APOGEE_TIERS[baseTier].label} · ${APOGEE_TIERS[baseTier].points}`
                  )}
                </span>
              ) : null}
            </div>
            <div className={`min-w-[4ch] text-right font-hud text-[22px] font-semibold tabular-nums transition-colors ${low ? "text-danger" : ""}`} role="timer" aria-label={`${Math.ceil(secs)} seconds left`}>
              {secs.toFixed(1)}
            </div>
          </div>
          <div className="h-1 overflow-hidden rounded-sm bg-white/[.08]">
            <div className="h-full w-full origin-left" style={{ transform: `scaleX(${Math.max(0, remaining / PROMPT_MS)})`, background: "linear-gradient(90deg, var(--accent), #ffc36b)", transition: "transform .1s linear" }} />
          </div>

          {result && (phase === "burning" || phase === "resolving") ? (
            <div style={{ animation: "ap-fade-in .3s both" }}>
              <div className="flex flex-wrap items-baseline gap-2.5 text-[18px] font-semibold">
                <span className="font-display text-[30px] font-extrabold" style={{ color: result.color }}>
                  {result.head}
                </span>
                <span>{result.text}</span>
              </div>
              <p className="mt-1 text-[14px] text-muted">{result.note}</p>
              {(prompt.kind === "odd_one_out" || prompt.kind === "ordered_recall") && phase === "resolving" && (
                <div className="mt-3">
                  {prompt.kind === "odd_one_out" && prompt.options && <OptionGrid options={prompt.options} onPick={() => {}} locked correct={rightOption} picked={picked} />}
                  {prompt.kind === "ordered_recall" && <OrderList items={order} onChange={() => {}} locked correctOrder={rightOrder} />}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="m-0 text-[19px] leading-tight font-semibold text-balance sm:text-[24px]">
                <PromptText text={prompt.text} />
              </p>
              {prompt.hintUsed && prompt.hint && (
                <p className="flex items-baseline gap-2 text-[14px] text-[#ffd9a8]" style={{ animation: "ap-fade-in .3s both" }}>
                  <span className="ap-eyebrow">hint</span>
                  <span>{prompt.hint}</span>
                </p>
              )}
              {prompt.kind === "odd_one_out" && prompt.options ? (
                <OptionGrid options={prompt.options} onPick={pickOption} locked={locked || !playing} correct={rightOption} picked={picked} />
              ) : prompt.kind === "ordered_recall" ? (
                <>
                  <OrderList items={order} onChange={setOrder} locked={locked || !playing} correctOrder={rightOrder} />
                  <div className="flex items-center justify-between gap-3">
                    <span className="hidden text-[12px] text-muted sm:inline">drag or ▲▼ · Enter locks in</span>
                    <button type="button" onClick={lockOrder} disabled={!playing || locked} className="ap-btn ap-btn-primary ml-auto">
                      Lock in order
                    </button>
                  </div>
                </>
              ) : (
                <form className="flex gap-2" onSubmit={submitTyped} autoComplete="off">
                  <input
                    key={position}
                    ref={inputRef}
                    className="ap-input"
                    placeholder={prompt.kind === "open" ? "Type any answer from your notes" : "Type your answer"}
                    aria-label="Your answer"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    disabled={!playing}
                    enterKeyHint="send"
                  />
                  <button type="submit" disabled={!playing} className="ap-btn ap-btn-primary px-5">
                    FIRE
                  </button>
                </form>
              )}
              <div className="flex min-h-[20px] items-center justify-between gap-3">
                <span className={`text-[14px] ${feedback?.bad ? "text-danger" : "text-muted"}`} aria-live="polite">
                  {feedback?.text ?? (prompt.kind === "odd_one_out" ? "Keys 1–4 pick an option" : "")}
                </span>
                {single && baseTier && prompt.hintAvailable && (
                  <button type="button" onClick={takeHint} disabled={!playing || prompt.hintUsed || hintAsked} className="ap-btn shrink-0" title={`Shows a clue and drops this prompt one Tier: ${hintCost}`}>
                    {prompt.hintUsed ? "Hint used" : "Hint"}
                    <span className="ml-1.5 font-hud text-[11px] font-normal text-muted">{hintCost}</span>
                  </button>
                )}
              </div>
            </>
          )}
          {notice && (
            <p className="text-center text-[14px] text-caution" role="status">
              {notice}
            </p>
          )}
        </section>
      )}

      {/* tier reveal */}
      {phase === "tier" && burn && (
        <div className="absolute inset-0 z-30" style={{ background: "radial-gradient(70% 60% at 50% 45%, rgba(4,5,12,.86), rgba(4,5,12,.55) 70%, rgba(4,5,12,.35))", animation: "ap-fade-in .35s both" }}>
          <TierReveal key={burn.key} tier={burn.tier} answer={burn.text} points={burn.points} altitude={burn.altitude} tags={{ hint: burn.hinted, stale: burn.stale }} onContinue={advance} cta={position >= total ? "MISSION REPORT" : "CONTINUE"} />
        </div>
      )}

      {phase === "ending" && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center" style={{ animation: "ap-fade-in .5s both" }}>
          <div className="text-center">
            <p className="ap-eyebrow">main engine cut-off</p>
            <p className="font-display text-[48px] font-black tracking-[0.08em] sm:text-[72px]" style={{ textShadow: "0 0 30px rgba(255,106,43,.5)" }}>
              MISSION COMPLETE
            </p>
            <p className="font-hud text-[14px] text-accent">downlinking telemetry…</p>
          </div>
        </div>
      )}
    </div>
  );
}
