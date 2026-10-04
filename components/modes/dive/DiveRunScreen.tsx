"use client";
// The Dive Run screen (/runs/[runId]), wired to the Run API. Same look and flow as
// DivePlayground, but the server owns the clock and the score:
//   card enters → POST start-prompt → play (countdown from deadlineAt + clock offset)
//   → guess / hint / timeout → correct: chip sinks past the tier lines, the camera descends,
//   catch screen (DESCEND ▼ / Enter / auto ~6 s) → next card enters → start-prompt …
//   → after Prompt 7: /runs/[runId]/reveal.
// The clock is paused during the catch screen because start-prompt is only called after it.
// Spec: docs/design/modes/dive.md §6, docs/architecture/run-and-scoring.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { PROMPT_MS } from "@/lib/modes/dive/rules";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { DiveRunState, GuessResponse, GuessResult, PromptKind, PromptOutcome } from "@/lib/runs/types";
import { TIER_BELOW, type Tier } from "@/lib/scoring/tiers";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { SoundToggle } from "@/components/ui/SoundToggle";
import { Fuse } from "@/components/round/Fuse";
import { HintButton } from "@/components/round/HintButton";
import { OptionGrid } from "@/components/round/OptionGrid";
import { OrderList } from "@/components/round/OrderList";
import type { SquareResult } from "@/components/round/ProgressSquares";
import { RoundCard, type RoundCardState } from "@/components/round/RoundCard";
import { SonarTimer } from "@/components/round/SonarTimer";
import { TypedInput } from "@/components/round/TypedInput";
import { CatchScreen } from "./CatchScreen";
import { DepthRuler } from "./DepthRuler";
import { DiveCamera } from "./depth";
import { DiveHud } from "./DiveHud";
import { OceanStage, type OceanStageHandle } from "./OceanStage";
import { TierLines, type Sink } from "./TierLines";
import { depthForScore, TIER_UI } from "./tiers";

/** How long the card's entry animation plays before the clock starts. */
const ENTER_MS = 750;
const KIND_LINE: Record<PromptKind, string> = {
  open: "▼ rarer answers sink deeper ▼",
  cloze: "FILL THE BLANK · ONE ANSWER",
  definition_to_term: "NAME THE TERM · ONE ANSWER",
  odd_one_out: "ODD ONE OUT · ONE TRY",
  ordered_recall: "PUT IN ORDER · ONE TRY",
  multiple_choice: "PICK ONE",
  true_false: "TRUE OR FALSE",
};

type Phase = "entering" | "play" | "sinking" | "descending" | "catch" | "resolving" | "surfacing";

type Props = {
  initial: DiveRunState;
  context: {
    runId: string;
    gameId: string;
    gameTitle: string;
    /** Prompts already closed (a reload mid-Run), to redraw the progress squares. */
    closed: { position: number; outcome: PromptOutcome; points: number }[];
  };
};

function squaresFrom(closed: Props["context"]["closed"]): SquareResult[] {
  const out: SquareResult[] = [];
  for (const c of closed) out[c.position - 1] = c.outcome !== "correct" ? "miss" : c.points >= 100 ? "gold" : "done";
  return out;
}

export function DiveRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const [camera] = useState(() => {
    const c = new DiveCamera();
    c.set(depthForScore(initial.score), true);
    return c;
  });
  const stageRef = useRef<OceanStageHandle>(null);
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(1);
  /** Requests run one at a time, so a late guess can't race a timeout. */
  const chain = useRef<Promise<void>>(Promise.resolve());
  /** The state to show after the catch / miss beat. */
  const pending = useRef<DiveRunState | null>(null);
  const timeoutBusy = useRef(false);

  const startPhase: Phase = initial.prompt?.startedAt ? "play" : "entering";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const posRef = useRef(initial.position);
  const [run, setRun] = useState(initial);
  const [score, setScore] = useState(initial.score);
  const [results, setResults] = useState<SquareResult[]>(() => squaresFrom(context.closed));
  const [remaining, setRemaining] = useState(() =>
    initial.prompt?.deadlineAt ? Math.max(0, Math.min(PROMPT_MS, msUntil(initial.prompt.deadlineAt, { offset: initialOffset }))) : PROMPT_MS,
  );
  const [cut, setCut] = useState({ ms: 0, key: 0 });
  const [rejectKey, setRejectKey] = useState(0);
  const [penaltyKey, setPenaltyKey] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [correction, setCorrection] = useState<string | null>(null);
  const [sink, setSink] = useState<Sink | null>(null);
  const [cardState, setCardState] = useState<RoundCardState>("in");
  const [stamp, setStamp] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(initial.prompt?.items ?? []);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rightOption, setRightOption] = useState<string | null>(null);
  const [rightOrder, setRightOrder] = useState<string[] | null>(null);
  const [hintAsked, setHintAsked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

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
  const markSquare = (r: SquareResult) =>
    setResults((xs) => {
      const n = [...xs];
      n[posRef.current - 1] = r;
      return n;
    });

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach(clearTimeout);
  }, []);

  // ------------------------------------------------------------------------------------
  // Moving between Prompts

  /** Show the next Prompt (or surface to the Reveal) once the catch / miss beat is over. */
  const advance = () => {
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    if (next.status !== "in_progress" || !next.prompt) {
      go("surfacing");
      sfx.whoosh();
      router.push(next.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`);
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
    setStamp(null);
    setCorrection(null);
    setSink(null);
    setCardState("in");
    setCut({ ms: 0, key: 0 });
    setRemaining(PROMPT_MS);
    go(next.prompt.startedAt ? "play" : "entering");
  };

  // ------------------------------------------------------------------------------------
  // The clock (asks the server to time out the Prompt when the countdown hits zero)

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
        // The server's clock says not yet (drift): take its deadline and ask again shortly.
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

  /** A correct answer: drop the chip; it lands, the camera descends, then the catch screen. */
  const succeed = (result: Extract<GuessResult, { correct: true }>, next: DiveRunState) => {
    const p = run.prompt!;
    const single = p.kind !== "open";
    const hinted = single && p.hintUsed;
    const scored: Tier = hinted ? (TIER_BELOW[result.tier] ?? "common") : result.tier;
    pending.current = next;
    sfx.correct(TIER_UI[scored].band as 1 | 2 | 3 | 4);
    setCorrection(null);
    setLocked(true);
    if (p.kind === "odd_one_out") setRightOption(result.answer);
    setSink({ key: counter.current++, text: p.kind === "ordered_recall" ? "All in order" : result.answer, tier: scored, points: result.points, stale: result.stale, hinted });
    go("sinking");
  };

  const onLanded = (s: Sink) => {
    const next = pending.current;
    const newScore = next?.score ?? score + s.points;
    setScore(newScore);
    markSquare(s.tier === "rare" ? "gold" : "done");
    stageRef.current?.mascot("happy");
    stageRef.current?.bubbles({ xFrac: 0.5, yFrac: 0.55, count: s.tier === "rare" ? 24 : 10, gold: s.tier === "rare" });
    if (s.tier === "rare") setFlashKey((k) => k + 1);
    camera.set(depthForScore(newScore));
    sfx.sink();
    setCardState("gone");
    go("descending");
    later(() => go("catch"), 950);
  };

  const fail = (next: DiveRunState, o: { stamp: string; correction: string; ms: number }) => {
    pending.current = next;
    go("resolving");
    setLocked(true);
    setCardState("shake");
    setStamp(o.stamp);
    setCorrection(o.correction);
    stageRef.current?.mascot("sad");
    markSquare("miss");
    later(advance, o.ms);
  };

  const failTimeout = (next: DiveRunState) => {
    sfx.timeout();
    setRemaining(0);
    fail(next, { stamp: "TIME!", correction: "Time's up. The answers are in the Reveal.", ms: 1800 });
  };

  const handleGuess = ({ result, state: next }: GuessResponse, text: string) => {
    if ("timedOut" in result) return failTimeout(next);
    if (result.correct) return succeed(result, next);
    if ("penaltyMs" in result) {
      sfx.wrong();
      setCut((c) => ({ ms: result.penaltyMs, key: c.key + 1 }));
      setRejectKey((k) => k + 1);
      setPenaltyKey((k) => k + 1);
      setCorrection(`${text} · not in your notes`);
      // The −3 s ran the clock out: the server already closed the Prompt.
      if (next.status !== "in_progress" || next.position !== posRef.current) return failTimeout(next);
      setRun(next);
      return;
    }
    // One-shot miss: the right answer comes back and the Prompt is closed.
    sfx.wrong();
    if (result.correctOrder) setRightOrder(result.correctOrder);
    else setRightOption(result.answer);
    fail(next, { stamp: "MISSED", correction: result.correctOrder ? "One try · the right order is marked" : `One try · it was ${result.answer}`, ms: 2600 });
  };

  /** Errors: 409 means the server moved on (resync); 0 means the connection dropped (retry). */
  const onError = (e: unknown) => {
    if (e instanceof RunApiError && e.status === 401) {
      setNotice("You're signed out. Sign in again to keep diving.");
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
        if (!("text" in body)) setLocked(false); // a one-shot that never landed can be tried again
        onError(e);
      }
    });
  };

  const submitTyped = (text: string) => {
    if (phaseRef.current !== "play") return;
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
  // Effects: start the clock once the card has entered, tick the countdown, keyboard

  // The card has entered: start the server clock.
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

  // Keyboard: 1–4 / A–D pick an odd-one-out option; Enter locks in an order.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (phaseRef.current !== "play" || !prompt || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
    if (typing) return;
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
  const hot = playing && remaining <= 5000;
  const single = !!prompt && prompt.kind !== "open";
  const promptTier = single ? (prompt?.tier ?? null) : null;
  const tierLine: Tier | null = promptTier ? (prompt?.hintUsed ? (TIER_BELOW[promptTier] ?? "common") : promptTier) : null;
  const showCard = !!prompt && phase !== "catch" && phase !== "surfacing";
  const showChoices = showCard && (phase === "entering" || phase === "play" || phase === "resolving");
  const oneShot = prompt?.kind === "odd_one_out" || prompt?.kind === "ordered_recall";

  return (
    <div data-theme="dive" className="relative isolate h-[100dvh] w-full overflow-hidden bg-bg font-hud text-text">
      <OceanStage ref={stageRef} camera={camera} sky="day" showMascot />
      <DepthRuler camera={camera} className="z-[1]" />

      {/* hot clock edge + Trench flash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          boxShadow: "inset 0 0 70px 6px var(--accent)",
          opacity: hot ? undefined : 0,
          animation: hot ? "edge-throb .8s ease-in-out infinite" : undefined,
        }}
      />
      {flashKey > 0 && (
        <div key={flashKey} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[30] bg-reward" style={{ animation: "dv-flash .6s ease-out forwards" }} />
      )}

      <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-2 sm:top-3">
        <DiveHud depth={depthForScore(score)} score={score} current={position} total={total} results={results} />
      </div>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={menuOpen}
        onClick={() => {
          sfx.click();
          setMenuOpen((o) => !o);
        }}
        className="dv-px absolute top-[88px] left-4 z-20 grid h-9 w-9 place-items-center sm:top-[104px] sm:left-8"
      >
        <PixelIcon name="menu" size={18} />
      </button>
      <div className="absolute top-[88px] right-16 z-20 sm:top-[104px] sm:right-24">
        <SoundToggle />
      </div>
      {menuOpen && (
        <div className="dv-panel absolute top-[136px] left-4 z-30 w-[min(340px,calc(100%-2rem))] p-4 sm:top-[152px] sm:left-8" style={{ animation: "pop-in .3s var(--ease-snap) both" }}>
          <p className="text-[14px] tracking-[0.3em] text-muted">DIVING</p>
          <p className="mt-1 truncate text-[22px] text-text">{context.gameTitle}</p>
          <p className="mt-2 font-sans text-[13px] leading-snug text-muted">The clock keeps running while this menu is open. Leaving ends nothing: reopen the dive from the Game page.</p>
          <div className="mt-3 flex flex-col gap-1.5">
            <button type="button" onClick={() => setMenuOpen(false)} className="text-left text-[20px] text-signal hover:underline">
              ▸ Back to the dive
            </button>
            <Link href={`/games/${context.gameId}`} className="text-[20px] text-muted hover:text-accent hover:underline">
              ▸ Surface to the Game page
            </Link>
          </div>
        </div>
      )}

      <div className="absolute inset-0 z-10 flex flex-col pr-16 pl-4 sm:px-24">
        {/* the card starts right under the waterline (25% down at the surface) */}
        <div className="min-h-[84px] shrink basis-[22%] sm:min-h-[100px] sm:basis-[25%]" />
        <div className="mx-auto w-full max-w-[640px] pt-2">
          {showCard && prompt && (
            <RoundCard
              key={position}
              label={`PROMPT ${position} OF ${total}`}
              text={prompt.text.length > 90 ? <span className="text-[0.78em] leading-[1.1]">{prompt.text}</span> : prompt.text}
              footer={KIND_LINE[prompt.kind]}
              hint={prompt.hintUsed ? (prompt.hint ?? null) : null}
              stamp={stamp}
              state={cardState}
              badge={
                tierLine ? (
                  <span className="text-[14px] tracking-[0.15em] uppercase" style={{ color: TIER_UI[tierLine].color }}>
                    {TIER_UI[tierLine].label} · {prompt.hintUsed && promptTier === "common" ? 5 : TIER_UI[tierLine].points}
                  </span>
                ) : null
              }
            />
          )}
        </div>

        {/* play area: tier lines, and the one-try inputs sitting over them */}
        <div className="relative mx-auto my-3 min-h-[120px] w-full max-w-[640px] flex-1">
          <div className="absolute inset-0 transition-opacity duration-500" style={{ opacity: phase === "play" || phase === "entering" || phase === "sinking" || phase === "resolving" ? 1 : 0 }}>
            <TierLines thisPrompt={tierLine} sink={sink} onLanded={onLanded} />
          </div>
          {showChoices && prompt?.kind === "odd_one_out" && prompt.options && (
            <div className="relative z-10 max-h-full overflow-y-auto pt-2" style={{ animation: "rise-in .5s var(--ease-out) .2s both" }}>
              <OptionGrid options={prompt.options} onPick={pickOption} locked={locked || !playing} correct={rightOption} picked={picked} />
            </div>
          )}
          {showChoices && prompt?.kind === "ordered_recall" && (
            <div className="relative z-10 max-h-full overflow-y-auto pt-1" style={{ animation: "rise-in .5s var(--ease-out) .2s both" }}>
              <OrderList items={order} onChange={setOrder} locked={locked || !playing} correctOrder={rightOrder} />
            </div>
          )}
        </div>

        {/* bottom dock */}
        <div className="mx-auto w-full max-w-[720px] pb-[max(12px,env(safe-area-inset-bottom))] sm:pb-6" style={{ visibility: phase === "catch" || phase === "surfacing" ? "hidden" : undefined }}>
          {notice && (
            <p className="mb-2 text-center text-[18px] text-caution" role="status">
              {notice}
            </p>
          )}
          <div className="flex items-start gap-3 sm:gap-4">
            <div className="relative">
              <SonarTimer remainingMs={remaining} totalMs={PROMPT_MS} paused={!playing} size={56} className="sm:hidden" />
              <SonarTimer remainingMs={remaining} totalMs={PROMPT_MS} paused={!playing} size={68} sound={false} className="hidden sm:block" />
              {penaltyKey > 0 && (
                <span key={penaltyKey} className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-[22px] text-accent" style={{ animation: "float-up .9s ease-out forwards" }}>
                  −3s
                </span>
              )}
            </div>
            {oneShot ? (
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  {prompt?.kind === "ordered_recall" && (
                    <button
                      type="button"
                      disabled={!playing || locked}
                      onClick={lockOrder}
                      className="h-12 px-5 text-[20px] tracking-[0.2em] text-text disabled:opacity-50 sm:h-14 sm:text-[24px]"
                      style={{ background: "color-mix(in srgb, var(--accent) 45%, #2a0c18)", boxShadow: "inset 0 0 0 2px var(--accent), 0 4px 0 #3b0f22" }}
                    >
                      LOCK IN ▼
                    </button>
                  )}
                  {prompt?.kind === "odd_one_out" && <span className="text-[18px] text-muted">pick the odd one out ▲ · keys 1–4</span>}
                  {prompt?.kind === "ordered_recall" && <span className="hidden text-[16px] text-muted sm:inline">drag or ▲▼ · Enter locks in</span>}
                </div>
                <div className="mt-2">
                  <Fuse remainingMs={remaining} totalMs={PROMPT_MS} />
                </div>
                <p className="mt-1 min-h-[22px] text-[16px] text-muted sm:text-[18px]" aria-live="polite">
                  {correction ?? ""}
                </p>
              </div>
            ) : (
              <TypedInput
                key={position}
                onSubmit={submitTyped}
                disabled={!playing}
                correction={correction}
                rejectKey={rejectKey}
                below={<Fuse remainingMs={remaining} totalMs={PROMPT_MS} cutMs={cut.ms} cutKey={cut.key} />}
              />
            )}
          </div>
          {single && promptTier && prompt?.hintAvailable && (
            <div className="mt-1 flex justify-center">
              <HintButton from={promptTier} to={TIER_BELOW[promptTier]} used={prompt.hintUsed || hintAsked || !playing} onUse={takeHint} />
            </div>
          )}
        </div>
      </div>

      {phase === "catch" && sink && (
        <div className="absolute inset-0 z-20">
          <CatchScreen key={sink.key} tier={sink.tier} answer={sink.text} points={sink.points} sinkMetres={sink.points * 10} tags={{ hint: !!sink.hinted, stale: !!sink.stale }} onContinue={advance} />
        </div>
      )}

      {phase === "surfacing" && (
        <div className="absolute inset-0 z-30 grid place-items-center" style={{ animation: "page-in .4s var(--ease-out) both" }}>
          <p className="text-[28px] tracking-[0.4em] text-signal glow-signal" style={{ animation: "title-flicker 1.6s ease-in-out infinite" }}>
            SURFACING…
          </p>
        </div>
      )}
      <style>{`@keyframes dv-flash { 0% { opacity: .55 } 100% { opacity: 0 } }`}</style>
    </div>
  );
}
