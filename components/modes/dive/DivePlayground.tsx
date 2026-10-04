"use client";
// A fake 7-Prompt Dive, entirely client-side, for /styleguide. Shows the whole Krillion flow:
// prompt under the waterline → the chip drops and the camera follows it down past the tier lines,
// 10 m per point → catch screen (DESCEND ▼, Enter, auto after 6 s; clock paused) → next prompt rises
// in → … → Reveal over the sea. A timeout or one-try miss shows NOTHING LANDED.
import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { RevealPrompt } from "@/lib/runs/types";
import { HINTED_COMMON_POINTS, TIER_BELOW, TIER_POINTS, type Tier } from "@/lib/scoring/tiers";
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
import { DepthMarks } from "./DepthMarks";
import { Descent, SKY_DEPTH, useSkyCarry, type Sink } from "./Descent";
import { DiveCamera, screenYOf } from "./depth";
import { DiveHud } from "./DiveHud";
import { DiveReveal } from "./DiveReveal";
import { OceanStage, type OceanStageHandle } from "./OceanStage";
import { cheatLine, fakeCrowd, matchGuess, PLAYGROUND_PROMPTS as PROMPTS, type FakePrompt } from "./playground-data";
import { depthForScore, TIER_UI } from "./tiers";

const ROUND_MS = 25_000;
const CROWD = fakeCrowd();
const PENALTY_MS = 3_000;
const KIND_LINE: Record<FakePrompt["kind"], string> = {
  open: "▼ rarer answers sink deeper ▼",
  cloze: "FILL THE BLANK · ONE ANSWER",
  definition_to_term: "NAME THE TERM · ONE ANSWER",
  odd_one_out: "ODD ONE OUT · ONE TRY",
  ordered_recall: "PUT IN ORDER · ONE TRY",
};

type Phase = "intro" | "play" | "sinking" | "descending" | "catch" | "resolving" | "missed" | "reveal";

function scrambled(items: string[]): string[] {
  // a fixed derangement-ish order, never the correct one
  const out = [...items.slice(1), items[0]];
  return out.length > 2 ? [out[1], out[0], ...out.slice(2)] : out;
}

function single(p: FakePrompt) {
  return p.kind !== "open";
}

export default function DivePlayground() {
  const [camera] = useState(() => {
    const c = new DiveCamera();
    c.min = SKY_DEPTH;
    c.set(SKY_DEPTH, true);
    return c;
  });
  const stageRef = useRef<OceanStageHandle>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastGuess = useRef<string | null>(null);
  const deadline = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(1);

  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<SquareResult[]>([]);
  const [remaining, setRemaining] = useState(ROUND_MS);
  const [cut, setCut] = useState({ ms: 0, key: 0 });
  const [rejectKey, setRejectKey] = useState(0);
  const [penaltyKey, setPenaltyKey] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [correction, setCorrection] = useState<string | null>(null);
  const [hintUsed, setHintUsed] = useState(false);
  const [sink, setSink] = useState<Sink | null>(null);
  const [cardState, setCardState] = useState<RoundCardState>("rise");
  const [miss, setMiss] = useState<{ key: number; answer: string | null; verdict?: string } | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [log, setLog] = useState<RevealPrompt[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const prompt = PROMPTS[idx];
  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms));
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useSkyCarry(camera, cardRef, rootRef);

  const startPrompt = (i: number) => {
    const p = PROMPTS[i];
    setIdx(i);
    setPhase("play");
    setRemaining(ROUND_MS);
    deadline.current = Date.now() + ROUND_MS + 1100; // the clock starts once the card has risen in
    setCardState(i === 0 ? "in" : "rise");
    setMiss(null);
    lastGuess.current = null;
    setStamp(null);
    setCorrection(null);
    setHintUsed(false);
    setSink(null);
    setPicked(null);
    setLocked(false);
    setCut({ ms: 0, key: 0 });
    setOrder(p.kind === "ordered_recall" ? scrambled(p.items) : []);
  };

  const startRun = () => {
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
    camera.set(0);
    setScore(0);
    setResults([]);
    setLog([]);
    sfx.whoosh();
    startPrompt(0);
  };

  const next = () => {
    if (idx + 1 >= PROMPTS.length) {
      setPhase("reveal");
      return;
    }
    startPrompt(idx + 1);
  };

  const record = (entry: Omit<RevealPrompt, "position" | "kind" | "text">) => {
    const p = prompt;
    const base: RevealPrompt = { position: idx + 1, kind: p.kind, text: p.text, ...entry };
    if (p.kind === "open") {
      base.answers = p.answers.map((a) => ({ answer: a.answer, tier: a.tier, found: a.answer === entry.yourAnswer, evidence: a.evidence }));
    } else {
      base.tier = p.tier;
      base.correctAnswer = p.kind === "ordered_recall" ? p.items.join(" → ") : p.answer;
      base.correctOrder = p.kind === "ordered_recall" ? p.items : undefined;
      base.explanation = p.explanation;
      base.evidence = p.evidence;
    }
    setLog((xs) => [...xs, base]);
  };

  /** A correct answer: score it and drop the chip. */
  const succeed = (answer: string, tier: Tier) => {
    const dropped: Tier | null = hintUsed ? TIER_BELOW[tier] : tier;
    const scoredTier: Tier = dropped ?? "common";
    const points = dropped ? TIER_POINTS[dropped] : HINTED_COMMON_POINTS;
    sfx.correct(TIER_UI[scoredTier].band as 1 | 2 | 3 | 4);
    setPhase("sinking");
    setCorrection(null);
    sfx.sink();
    setSink({ key: counter.current++, text: answer, tier: scoredTier, points, hinted: hintUsed, from: camera.depth, startY: chipStartY() });
    record({ outcome: "correct", points, hintUsed, stale: false, yourAnswer: answer });
  };

  /** The chip drops in just under the prompt card. */
  const chipStartY = () => {
    const root = rootRef.current?.getBoundingClientRect();
    const card = cardRef.current?.getBoundingClientRect();
    if (!root || !card || card.height === 0) return undefined;
    return card.bottom - root.top + 40;
  };

  const onLanded = (s: Sink) => {
    const total = score + s.points;
    setScore(total);
    setResults((r) => {
      const n = [...r];
      n[idx] = s.tier === "rare" ? "gold" : "done";
      return n;
    });
    stageRef.current?.mascot("happy");
    const h = rootRef.current?.getBoundingClientRect().height ?? 0;
    const yFrac = h ? screenYOf(camera.depth, camera.depth, h) / h : 0.45;
    stageRef.current?.bubbles({ xFrac: 0.5, yFrac, count: s.tier === "rare" ? 24 : 12, gold: s.tier === "rare" });
    if (s.tier === "rare") setFlashKey((k) => k + 1);
    setPhase("descending");
    later(() => setPhase("catch"), 380);
  };

  const fail = (opts: { stampText?: string; correctionText: string; yourAnswer: string | null; outcome: "wrong" | "timeout"; verdict?: string }) => {
    setPhase("resolving");
    setLocked(true);
    setCardState("shake");
    setStamp(opts.stampText ?? null);
    setCorrection(opts.correctionText);
    stageRef.current?.mascot("sad");
    setResults((r) => {
      const n = [...r];
      n[idx] = "miss";
      return n;
    });
    record({ outcome: opts.outcome, points: 0, hintUsed, stale: false, yourAnswer: opts.yourAnswer });
    later(() => {
      setMiss({ key: counter.current++, answer: opts.yourAnswer ?? lastGuess.current, verdict: opts.verdict });
      setPhase("missed");
    }, opts.outcome === "timeout" ? 900 : 1800);
  };

  const timeout = () => {
    sfx.timeout();
    setRemaining(0);
    fail({ stampText: "TIME!", correctionText: "Time's up.", yourAnswer: null, outcome: "timeout" });
  };

  const onTick = useEffectEvent(() => {
    const rem = Math.min(ROUND_MS, deadline.current - Date.now());
    setRemaining(rem);
    if (rem <= 0) timeout();
  });

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase, idx]);

  const submitTyped = (text: string) => {
    if (phase !== "play") return;
    const m = matchGuess(prompt, text);
    if (m) return succeed(m.answer, m.tier);
    deadline.current -= PENALTY_MS;
    sfx.wrong();
    setCut((c) => ({ ms: PENALTY_MS, key: c.key + 1 }));
    setRejectKey((k) => k + 1);
    setPenaltyKey((k) => k + 1);
    lastGuess.current = text;
    setCorrection(`“${text}”: no echo · try again`);
    if (deadline.current - Date.now() <= 0) timeout();
  };

  const pickOption = (o: string) => {
    if (phase !== "play" || prompt.kind !== "odd_one_out") return;
    setPicked(o);
    setLocked(true);
    if (o === prompt.answer) return succeed(o, prompt.tier);
    sfx.wrong();
    fail({ correctionText: `One try · it was ${prompt.answer}`, yourAnswer: o, outcome: "wrong", verdict: `One try · it was ${prompt.answer}.` });
  };

  const lockOrder = () => {
    if (phase !== "play" || prompt.kind !== "ordered_recall") return;
    setLocked(true);
    if (order.every((x, i) => x === prompt.items[i])) return succeed(order.join(" → "), prompt.tier);
    sfx.wrong();
    fail({ correctionText: `One try · it was ${prompt.items.join(" → ")}`, yourAnswer: order.join(" → "), outcome: "wrong", verdict: "One try · the order was off." });
  };

  const takeHint = () => {
    if (phase !== "play" || !single(prompt) || hintUsed) return;
    setHintUsed(true);
  };

  const playing = phase === "play";
  const hot = playing && remaining <= 5000;
  const promptTierLine = single(prompt) ? (hintUsed ? (TIER_BELOW[prompt.tier] ?? "common") : prompt.tier) : null;
  const showCard = phase !== "intro" && phase !== "catch" && phase !== "missed" && phase !== "reveal";
  const showDock = phase === "intro" || phase === "play" || phase === "resolving";
  const lastSink = sink;

  return (
    <div ref={rootRef} data-theme="dive" className="relative isolate h-[100svh] max-h-[960px] min-h-[660px] w-full overflow-hidden bg-bg font-hud text-text">
      <OceanStage ref={stageRef} camera={camera} sky={phase === "reveal" ? "dusk" : "day"} showMascot={phase !== "reveal"} />
      {phase !== "reveal" && <DepthMarks camera={camera} className="z-[1]" />}
      <Descent
        camera={camera}
        sink={phase === "reveal" ? null : lastSink}
        onLanded={onLanded}
        onShift={(px) => {
          if (cardRef.current) cardRef.current.style.transform = px ? `translate3d(0, ${px}px, 0)` : "";
        }}
        onTrail={(xFrac, yFrac) => stageRef.current?.bubbles({ xFrac, yFrac, count: 2 })}
        fade={phase === "catch" || phase === "missed"}
        className="z-[3]"
      />

      {/* hot clock: the top edge glows red (Krillion) + Trench flash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[2] h-28"
        style={{
          background: "linear-gradient(to bottom, color-mix(in srgb, var(--accent) 55%, transparent), transparent)",
          opacity: hot ? undefined : 0,
          animation: hot ? "edge-throb .8s ease-in-out infinite" : undefined,
        }}
      />
      {flashKey > 0 && (
        <div key={flashKey} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[30] bg-reward" style={{ animation: "dv-flash .6s ease-out forwards" }} />
      )}

      {phase !== "reveal" && (
        <>
          <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-2 sm:top-3">
            <DiveHud depth={depthForScore(score)} score={score} current={idx + 1} total={PROMPTS.length} results={results} camera={camera} />
          </div>
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="dv-px absolute top-[88px] left-4 z-20 grid h-9 w-9 place-items-center sm:top-[104px] sm:left-8"
          >
            <PixelIcon name="menu" size={18} />
          </button>
          <div className="absolute top-[88px] right-16 z-20 sm:top-[104px] sm:right-24">
            <SoundToggle />
          </div>
          {menuOpen && (
            <div className="dv-panel absolute top-[136px] left-4 z-30 w-[min(340px,calc(100%-2rem))] p-4 sm:top-[152px] sm:left-8" style={{ animation: "pop-in .3s var(--ease-snap) both" }}>
              <p className="text-[14px] tracking-[0.3em] text-muted">PLAYGROUND</p>
              <button type="button" onClick={() => { setMenuOpen(false); startRun(); }} className="mt-2 block text-[20px] text-signal hover:underline">
                ↺ Restart the dive
              </button>
              <details className="mt-3">
                <summary className="cursor-pointer text-[18px] text-reward">Cheat sheet</summary>
                <ol className="mt-2 flex max-h-[40vh] flex-col gap-2 overflow-y-auto font-sans text-[12px] leading-snug text-muted">
                  {PROMPTS.map((p, i) => (
                    <li key={i}>
                      <span className="text-text">{i + 1}. {p.text}</span>
                      <br />
                      {cheatLine(p)}
                    </li>
                  ))}
                </ol>
              </details>
            </div>
          )}

          {/* Krillion's title shot: the name in the sky over the boat, then BEGIN DESCENT pans down */}
          <div
            className="pointer-events-none absolute inset-x-0 top-[14%] z-10 flex flex-col items-center px-4 text-center transition-[opacity,transform] duration-500"
            style={{ opacity: phase === "intro" ? 1 : 0, transform: phase === "intro" ? undefined : "translateY(-40px)" }}
            aria-hidden={phase !== "intro"}
          >
            <h1 className="font-hud text-[clamp(56px,9vw,104px)] leading-none tracking-[0.12em] text-accent" style={{ textShadow: "3px 0 var(--signal), -1px 0 #fff" }}>
              DIVE
            </h1>
            <p className="mt-2 font-hud text-[clamp(16px,2vw,22px)] tracking-[0.5em] text-signal">THE PLAYGROUND</p>
            <p className="mt-3 font-hud text-[clamp(14px,1.5vw,18px)] tracking-[0.1em] text-[#33465f]">7 prompts · 25 seconds each · rarer answers sink deeper</p>
            <p className="mt-1 font-sans text-[12px] text-[#4b5f7a]">A fake run: no API, nothing saved.</p>
          </div>

          <div className="absolute inset-0 z-10 flex flex-col pr-16 pl-4 sm:px-24">
            {/* the card starts right under the waterline (25% down at the surface) */}
            <div className="h-[25%] shrink-0" />
            <div ref={cardRef} className="mx-auto w-full max-w-[640px] pt-2 will-change-transform">
              {showCard ? (
                <RoundCard
                  key={idx}
                  label={`PROMPT ${idx + 1} OF ${PROMPTS.length}`}
                  text={prompt.text}
                  footer={KIND_LINE[prompt.kind]}
                  hint={hintUsed && single(prompt) && "hint" in prompt ? prompt.hint : null}
                  stamp={stamp}
                  state={cardState}
                  badge={
                    promptTierLine ? (
                      <span className="text-[14px] tracking-[0.15em] uppercase" style={{ color: TIER_UI[promptTierLine].color }}>
                        {TIER_UI[promptTierLine].label} · {TIER_UI[promptTierLine].points}
                      </span>
                    ) : null
                  }
                />
              ) : null}
            </div>

            {/* play area: the one-try inputs (the tier lines only appear in the water once you answer) */}
            <div className="relative mx-auto my-3 min-h-0 w-full max-w-[640px] flex-1">
              {showCard && prompt.kind === "odd_one_out" && (phase === "play" || phase === "resolving") && (
                <div className="relative z-10 pt-2" style={{ animation: "rise-in .5s var(--ease-out) .2s both" }}>
                  <OptionGrid options={prompt.options} onPick={pickOption} locked={locked} correct={locked ? prompt.answer : null} picked={picked} />
                </div>
              )}
              {showCard && prompt.kind === "ordered_recall" && (phase === "play" || phase === "resolving") && (
                <div className="relative z-10 pt-1" style={{ animation: "rise-in .5s var(--ease-out) .2s both" }}>
                  <OrderList items={order} onChange={setOrder} locked={locked} correctOrder={locked ? prompt.items : null} />
                </div>
              )}
            </div>

            {/* bottom dock */}
            <div
              className="mx-auto w-full max-w-[720px] pb-3 transition-[opacity,transform] duration-300 sm:pb-6"
              style={{ opacity: showDock ? 1 : 0, transform: showDock ? undefined : "translateY(24px)", pointerEvents: showDock ? undefined : "none" }}
            >
              <div key={phase === "intro" ? "intro" : idx} style={{ animation: phase === "intro" ? undefined : "dv-dock-in .6s var(--ease-out) .5s both" }}>
                {phase === "intro" ? (
                  <div className="flex justify-center pb-6">
                    <button
                      type="button"
                      onClick={startRun}
                      className="px-8 py-3 text-[24px] tracking-[0.25em] text-text transition hover:-translate-y-0.5 active:translate-y-[2px] sm:text-[28px]"
                      style={{
                        background: "color-mix(in srgb, var(--accent) 35%, #12081a)",
                        boxShadow: "inset 0 0 0 3px var(--accent), 0 0 22px color-mix(in srgb, var(--accent) 40%, transparent), 0 5px 0 #3b0f22",
                        animation: "btn-bob 2.4s ease-in-out infinite",
                      }}
                    >
                      ▼ BEGIN DESCENT ▼
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 sm:gap-4">
                    <div className="relative">
                      <SonarTimer remainingMs={remaining} totalMs={ROUND_MS} paused={!playing} size={56} className="sm:hidden" />
                      <SonarTimer remainingMs={remaining} totalMs={ROUND_MS} paused={!playing} size={68} sound={false} className="hidden sm:block" />
                      {penaltyKey > 0 && (
                        <span key={penaltyKey} className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 text-[22px] text-accent" style={{ animation: "float-up .9s ease-out forwards" }}>
                          −3s
                        </span>
                      )}
                    </div>
                    {prompt.kind === "odd_one_out" || prompt.kind === "ordered_recall" ? (
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3">
                          {prompt.kind === "ordered_recall" && (
                            <button
                              type="button"
                              disabled={!playing}
                              onClick={lockOrder}
                              className="h-12 px-5 text-[20px] tracking-[0.2em] text-text disabled:opacity-50 sm:h-14 sm:text-[24px]"
                              style={{ background: "color-mix(in srgb, var(--accent) 45%, #2a0c18)", boxShadow: "inset 0 0 0 2px var(--accent), 0 4px 0 #3b0f22" }}
                            >
                              LOCK IN ▼
                            </button>
                          )}
                          {prompt.kind === "odd_one_out" && <span className="text-[18px] text-muted">pick the odd one out ▲</span>}
                        </div>
                        <div className="mt-2">
                          <Fuse remainingMs={remaining} totalMs={ROUND_MS} />
                        </div>
                        <p className="mt-1 min-h-[22px] text-[16px] text-muted sm:text-[18px]" aria-live="polite">
                          {correction ?? ""}
                        </p>
                      </div>
                    ) : (
                      <TypedInput
                        onSubmit={submitTyped}
                        disabled={!playing}
                        correction={correction}
                        rejectKey={rejectKey}
                        below={<Fuse remainingMs={remaining} totalMs={ROUND_MS} cutMs={cut.ms} cutKey={cut.key} />}
                      />
                    )}
                  </div>
                )}
                {phase !== "intro" && single(prompt) && (
                  <div className="mt-1 flex justify-center">
                    <HintButton from={prompt.tier} to={TIER_BELOW[prompt.tier]} used={hintUsed || !playing} onUse={takeHint} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {phase === "catch" && lastSink && (
            <div className="absolute inset-0 z-20">
              <CatchScreen
                key={lastSink.key}
                tier={lastSink.tier}
                answer={lastSink.text}
                points={lastSink.points}
                sinkMetres={lastSink.points * 10}
                tags={{ hint: !!lastSink.hinted }}
                onContinue={next}
              />
            </div>
          )}
          {phase === "missed" && miss && (
            <div className="absolute inset-0 z-20">
              <CatchScreen key={miss.key} tier="miss" answer={miss.answer} points={0} sinkMetres={0} verdict={miss.verdict} onContinue={next} />
            </div>
          )}
        </>
      )}

      {phase === "reveal" && (
        <DiveReveal
          camera={camera}
          title="DIVE #1 COMPLETE"
          score={score}
          prompts={log}
          distribution={{ values: CROWD, caption: `BETTER THAN ${Math.round((CROWD.filter((v) => v < score).length / CROWD.length) * 100)}% OF TODAY'S PLAYERS · PLAYGROUND DATA` }}
          personalBest={score > 0}
          onAgain={startRun}
          onBack={() => {
            camera.set(SKY_DEPTH);
            setPhase("intro");
          }}
          backLabel="BACK TO PLAYGROUND"
        />
      )}
      <style>{`
        @keyframes dv-flash { 0% { opacity: .22 } 100% { opacity: 0 } }
        @keyframes dv-dock-in { from { opacity: 0; transform: translateY(40px) } }
      `}</style>
    </div>
  );
}
