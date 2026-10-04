"use client";
// The Pairs Run screen (/runs/[runId]) on the Run API. A pixel card table, terms left and
// definitions right (on phones: a row of term chips over a stack of definitions).
//   Board intro (cards face down, MATCH ▶) → POST start-prompt → the deal (cards flip up)
//   → pick a term and a definition → POST pair → match: the cards snap together, a link line,
//   +50 and sparkles, then they fly to the MATCHED tray · mismatch: both shake, −10 · −2 s
//   → all 6 matched: BOARD CLEAR, the time bonus counts up · clock out: "Time!"
//   → Board 2 intro … → /runs/[runId]/reveal.
// The server owns the clock and the pairing (ids are opaque). Spec: docs/design/modes/pairs.md.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { PAIRS_BOARD_MS, PAIRS_BONUS_PER_SECOND, PAIRS_MATCH_POINTS } from "@/lib/modes/pairs/rules";
import { burst } from "@/lib/motion/particles";
import { tween } from "@/lib/motion/spring";
import { msUntil, RunApiError, runApi, type Clock } from "@/lib/runs/client";
import type { PairResponse, PairsRunState } from "@/lib/runs/types";
import { sfx } from "@/lib/ui/sfx";
import { Mascot, type MascotHandle } from "@/components/ui/Mascot";
import { Odometer } from "@/components/ui/Odometer";
import { SoundToggle } from "@/components/ui/SoundToggle";
import s from "./pairs.module.css";

type Side = "term" | "def";
type Phase = "intro" | "dealing" | "play" | "cleared" | "timeup" | "leaving";
type CardFx = "idle" | "selected" | "lock" | "fly" | "miss" | "ghost" | "dead";
type LinkFx = {
  key: number;
  termId: string;
  defId: string;
  line: { x1: number; y1: number; x2: number; y2: number };
  stage: "lock" | "fly";
  slot: number;
  /** Set when the cards take off: how far each one travels to its tray slot. */
  fly?: { term: { dx: number; dy: number }; def: { dx: number; dy: number } };
};
type Pop = { key: number; x: number; y: number; text: string; tone: "good" | "bad" };
type TrayItem = { term: string; def: string };
type BoardEnd = ({ kind: "cleared"; bonus: number; seconds: number } | { kind: "timeup"; matched: number }) & {
  /** The next Board's number, or null when this was the last. */
  nextBoard: number | null;
};

const LOCK_MS = 620; //  the snap + link line, before the cards fly
const FLY_MS = 520;

type Props = {
  initial: PairsRunState;
  context: { runId: string; gameId: string; gameTitle: string };
};

export function PairsRunScreen({ initial, context }: Props) {
  const router = useRouter();
  const runId = initial.runId;
  const perBoard = initial.pairsPerBoard;
  const [initialOffset] = useState(() => Date.parse(initial.serverNow) - Date.now());
  const clock = useRef<Clock>({ offset: initialOffset });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const counter = useRef(1);
  const busy = useRef(false);
  const timeoutBusy = useRef(false);
  const lastSpoken = useRef<number | null>(null);
  /** The state to move to once a Board's ending beat is over. */
  const pending = useRef<PairsRunState | null>(null);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  const mascot = useRef<MascotHandle>(null);
  const traySlots = useRef(initial.current?.matches.length ?? 0);

  const startPhase: Phase = initial.startedAt && initial.current ? "play" : "intro";
  const [phase, setPhaseState] = useState<Phase>(startPhase);
  const phaseRef = useRef<Phase>(startPhase);
  const boardRef = useRef(initial.board);
  const [run, setRun] = useState(initial);
  const [score, setScore] = useState(initial.score);
  const [remaining, setRemaining] = useState(() =>
    initial.deadlineAt ? Math.max(0, Math.min(PAIRS_BOARD_MS, msUntil(initial.deadlineAt, { offset: initialOffset }))) : PAIRS_BOARD_MS,
  );
  const [selTerm, setSelTerm] = useState<string | null>(null);
  const [selDef, setSelDef] = useState<string | null>(null);
  const [links, setLinks] = useState<LinkFx[]>([]);
  const [miss, setMiss] = useState<{ ids: string[]; key: number } | null>(null);
  const [pops, setPops] = useState<Pop[]>([]);
  const [localMatched, setLocalMatched] = useState<Set<string>>(() => new Set());
  const [tray, setTray] = useState<(TrayItem | null)[]>(() => initialTray(initial));
  const [focus, setFocus] = useState<{ term: number; def: number }>({ term: 0, def: 0 });
  const [cutKey, setCutKey] = useState(0);
  const [boardEnd, setBoardEnd] = useState<BoardEnd | null>(null);
  const [bonusShown, setBonusShown] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [announce, setAnnounce] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const pendingTimers = timers.current;
    return () => pendingTimers.forEach(clearTimeout);
  }, []);

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

  const current = run.current;
  const terms = current?.terms ?? [];
  const defs = current?.definitions ?? [];
  const isMatched = (id: string, serverFlag: boolean) => serverFlag || localMatched.has(id);
  const matchedCount = terms.filter((t) => isMatched(t.id, t.matched)).length;
  const matchedCountRef = useRef(matchedCount);
  useEffect(() => {
    matchedCountRef.current = matchedCount;
  }, [matchedCount]);

  // ------------------------------------------------------------------------------------
  // Boards

  const startBoard = () => {
    if (phaseRef.current !== "intro") return;
    sfx.whoosh();
    go("dealing");
    const board = boardRef.current;
    enqueue(async () => {
      try {
        const st = await runApi.startPrompt<PairsRunState>(runId, clock.current);
        if (st.status !== "in_progress" || st.board !== board || !st.current) return advance(st);
        setRun(st);
        setScore(st.score);
        setRemaining(st.deadlineAt ? Math.max(0, msUntil(st.deadlineAt, clock.current)) : PAIRS_BOARD_MS);
        setTray(initialTray(st));
        traySlots.current = st.current.matches.length;
        lastSpoken.current = null;
        timeoutBusy.current = false;
        go("play");
        setAnnounce(`Board ${board}. ${perBoard} pairs. 60 seconds. Terms on the left, definitions on the right.`);
        st.current.terms.forEach((_, i) => later(() => sfx.tick(), 60 + i * 55));
        later(() => {
          const first = st.current?.terms.find((t) => !t.matched);
          if (first) cardRefs.current.get(first.id)?.focus({ preventScroll: true });
        }, 450);
      } catch (e) {
        go("intro");
        onError(e);
      }
    });
  };

  /** After a Board's ending beat: the next Board's intro, or the Reveal. */
  const advance = (next: PairsRunState) => {
    pending.current = null;
    if (next.status !== "in_progress") {
      go("leaving");
      sfx.whoosh();
      later(() => router.push(next.status === "finished" ? `/runs/${runId}/reveal` : `/runs/${runId}`), next.outcome === "cleared" ? 1500 : 1100);
      return;
    }
    boardRef.current = next.board;
    setRun(next);
    setScore(next.score);
    setLinks([]);
    setPops([]);
    setMiss(null);
    setSelTerm(null);
    setSelDef(null);
    setLocalMatched(new Set());
    setTray(initialTray(next));
    traySlots.current = next.current?.matches.length ?? 0;
    setFocus({ term: 0, def: 0 });
    setBoardEnd(null);
    setRemaining(PAIRS_BOARD_MS);
    timeoutBusy.current = false;
    go(next.startedAt && next.current ? "play" : "intro");
  };

  const boardCleared = (next: PairsRunState, bonus: number) => {
    pending.current = next;
    const seconds = Math.round(bonus / PAIRS_BONUS_PER_SECOND);
    // let the last pair land in the tray first
    later(() => {
      go("cleared");
      setBoardEnd({ kind: "cleared", bonus, seconds, nextBoard: next.status === "in_progress" ? next.board : null });
      setBonusShown(0);
      setHistory((h) => [...h, `Board ${boardRef.current}: cleared · +${bonus} time bonus`]);
      setAnnounce(`Board clear! ${seconds} seconds left: plus ${bonus}.`);
      sfx.reward();
      mascot.current?.react("wow");
      later(() => {
        let last = 0;
        tween({
          from: 0,
          to: bonus,
          duration: Math.min(1400, 300 + bonus * 4),
          onUpdate: (v) => {
            const n = Math.round(v);
            setBonusShown(n);
            const now = performance.now();
            if (now - last > 50) {
              last = now;
              sfx.count();
            }
          },
          onRest: () => {
            setScore(next.score);
            sfx.ping();
            const el = tableRef.current;
            if (el) {
              const r = el.getBoundingClientRect();
              burst(r.left + r.width / 2, r.top + r.height * 0.4, { count: 70, spread: 520 });
            }
          },
        });
      }, 650);
      later(() => advance(next), 3600);
    }, LOCK_MS + FLY_MS + 80);
  };

  const timeUp = (next: PairsRunState) => {
    if (phaseRef.current === "timeup" || phaseRef.current === "leaving") return;
    pending.current = next;
    go("timeup");
    setRemaining(0);
    setSelTerm(null);
    setSelDef(null);
    sfx.timeout();
    mascot.current?.react("sad");
    const matched = matchedCountRef.current;
    setBoardEnd({ kind: "timeup", matched, nextBoard: next.status === "in_progress" ? next.board : null });
    setHistory((h) => [...h, `Board ${boardRef.current}: time ran out · ${matched} of ${perBoard} matched`]);
    setAnnounce(`Time! ${matched} of ${perBoard} pairs matched.`);
    later(() => advance(next), 2400);
  };
  // ------------------------------------------------------------------------------------
  // Pairing

  const pick = (side: Side, id: string, viaKeyboard: boolean) => {
    if (phaseRef.current !== "play" || busy.current) return;
    if (localMatched.has(id) || links.some((l) => l.termId === id || l.defId === id)) return;
    sfx.click();
    if (side === "term") {
      const next = selTerm === id ? null : id;
      setSelTerm(next);
      if (next && selDef) submit(next, selDef);
      else if (next && viaKeyboard) focusSide("def", focus.def);
    } else {
      const next = selDef === id ? null : id;
      setSelDef(next);
      if (next && selTerm) submit(selTerm, next);
      else if (next && viaKeyboard) focusSide("term", focus.term);
    }
  };

  const submit = (termId: string, defId: string) => {
    busy.current = true;
    const board = boardRef.current;
    enqueue(async () => {
      try {
        if (phaseRef.current !== "play" || boardRef.current !== board) return;
        const res = await runApi.pair(runId, { termId, definitionId: defId, board }, clock.current);
        if (boardRef.current !== board || phaseRef.current !== "play") return;
        handlePair(res, termId, defId);
      } catch (e) {
        setSelTerm(null);
        setSelDef(null);
        onError(e);
      } finally {
        busy.current = false;
      }
    });
  };

  const handlePair = ({ result, state: next }: PairResponse, termId: string, defId: string) => {
    if ("timedOut" in result) return timeUp(next);
    const geo = geometry(termId, defId);
    if (result.correct) {
      const slot = traySlots.current++;
      const key = counter.current++;
      const termText = terms.find((t) => t.id === termId)?.text ?? "";
      const defText = defs.find((d) => d.id === defId)?.text ?? "";
      setSelTerm(null);
      setSelDef(null);
      setLocalMatched((m) => new Set(m).add(termId).add(defId));
      setScore((x) => x + result.points);
      if (geo) {
        setLinks((ls) => [...ls, { key, termId, defId, line: geo.line, stage: "lock", slot }]);
        addPop(geo.mid.x, geo.mid.y, `+${result.points} PAIR!`, "good");
        burst(geo.screen.x, geo.screen.y, { kind: "spark", count: 26, spread: 320, colors: ["#ffd166", "#fff7e6", "#6dffb0", "#ff9f43"] });
      }
      sfx.correct(3);
      mascot.current?.react("happy");
      setAnnounce(`Pair! ${termText}. Plus ${result.points}.`);
      // the active card is about to disappear: keep keyboard focus on the table
      const active = document.activeElement;
      if (active === cardRefs.current.get(termId) || active === cardRefs.current.get(defId)) {
        const nextTerm = terms.find((t) => t.id !== termId && !isMatched(t.id, t.matched));
        if (nextTerm) later(() => cardRefs.current.get(nextTerm.id)?.focus({ preventScroll: true }), 30);
      }
      later(() => {
        const fly = { term: flyDelta(termId, slot), def: flyDelta(defId, slot) };
        setLinks((ls) => ls.map((l) => (l.key === key ? { ...l, stage: "fly", fly } : l)));
        sfx.whoosh();
      }, LOCK_MS);
      later(() => {
        setLinks((ls) => ls.filter((l) => l.key !== key));
        setTray((t) => {
          const n = [...t];
          n[slot] = { term: termText, def: defText };
          return n;
        });
        sfx.pop();
      }, LOCK_MS + FLY_MS);
      if (result.boardCleared) return boardCleared(next, result.timeBonus);
      setRun(next);
      return;
    }
    // Mismatch
    sfx.wrong();
    mascot.current?.react("sad");
    const key = counter.current++;
    setMiss({ ids: [termId, defId], key });
    setCutKey((k) => k + 1);
    setScore(next.score);
    if (geo) addPop(geo.mid.x, geo.mid.y, result.pointsLost > 0 ? `−${result.pointsLost} · −2 s` : "−2 s", "bad");
    setAnnounce(result.pointsLost > 0 ? `Not a pair. Minus ${result.pointsLost} points and 2 seconds.` : "Not a pair. Minus 2 seconds.");
    later(() => {
      setMiss((m) => (m?.key === key ? null : m));
      setSelTerm((t) => (t === termId ? null : t));
      setSelDef((d) => (d === defId ? null : d));
    }, 480);
    if (next.status !== "in_progress" || next.board !== boardRef.current) return timeUp(next);
    setRun(next);
  };

  const addPop = (x: number, y: number, text: string, tone: Pop["tone"]) => {
    const key = counter.current++;
    setPops((p) => [...p, { key, x, y, text, tone }]);
    later(() => setPops((p) => p.filter((q) => q.key !== key)), 1050);
  };

  /** Where to draw the link line (table coordinates) and the burst (viewport coordinates). */
  const geometry = (termId: string, defId: string) => {
    const box = tableRef.current?.getBoundingClientRect();
    const a = cardRefs.current.get(termId)?.getBoundingClientRect();
    const b = cardRefs.current.get(defId)?.getBoundingClientRect();
    if (!box || !a || !b) return null;
    const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    let x1: number, y1: number, x2: number, y2: number;
    if (Math.abs(bc.x - ac.x) > Math.abs(bc.y - ac.y)) {
      const right = ac.x < bc.x;
      [x1, y1, x2, y2] = [right ? a.right : a.left, ac.y, right ? b.left : b.right, bc.y];
    } else {
      const below = ac.y < bc.y;
      [x1, y1, x2, y2] = [ac.x, below ? a.bottom : a.top, bc.x, below ? b.top : b.bottom];
    }
    const line = { x1: x1 - box.left, y1: y1 - box.top, x2: x2 - box.left, y2: y2 - box.top };
    return { line, mid: { x: (line.x1 + line.x2) / 2, y: (line.y1 + line.y2) / 2 }, screen: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 } };
  };

  /** How far a card travels to its tray slot. */
  const flyDelta = (id: string, slot: number) => {
    const a = cardRefs.current.get(id)?.getBoundingClientRect();
    const b = slotRefs.current[slot]?.getBoundingClientRect();
    if (!a || !b) return { dx: 0, dy: 0 };
    return { dx: b.left + b.width / 2 - (a.left + a.width / 2), dy: b.top + b.height / 2 - (a.top + a.height / 2) };
  };

  // ------------------------------------------------------------------------------------
  // Errors

  const onError = (e: unknown) => {
    if (e instanceof RunApiError && e.status === 401) return setNotice("You're signed out. Sign in again to keep playing.");
    if (e instanceof RunApiError && e.status === 0) {
      setNotice("Connection lost · reconnecting…");
      later(resync, 1500);
      return;
    }
    if (e instanceof RunApiError && (e.status === 409 || e.status === 400)) return resync();
    setNotice(e instanceof Error ? e.message : "Something went wrong");
  };

  const resync = () => {
    enqueue(async () => {
      try {
        const st = await runApi.state<PairsRunState>(runId, clock.current);
        setNotice(null);
        if (st.status !== "in_progress" || st.board !== boardRef.current) {
          if (phaseRef.current === "play" || phaseRef.current === "dealing") timeUp(st);
          else if (pending.current) pending.current = st;
          return;
        }
        setRun(st);
        setScore(st.score);
        if (phaseRef.current === "dealing" && st.current) go("play");
      } catch (err) {
        if (err instanceof RunApiError && err.status === 0) later(resync, 2500);
        else setNotice(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  // ------------------------------------------------------------------------------------
  // The clock

  const requestTimeout = () => {
    if (timeoutBusy.current) return;
    timeoutBusy.current = true;
    const board = boardRef.current;
    enqueue(async () => {
      if (phaseRef.current !== "play" || boardRef.current !== board) return;
      try {
        const st = await runApi.timeout<PairsRunState>(runId, clock.current);
        if (phaseRef.current !== "play" || boardRef.current !== board) return;
        if (st.status !== "in_progress" || st.board !== board) return timeUp(st);
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
    const rem = Math.min(PAIRS_BOARD_MS, msUntil(run.deadlineAt, clock.current));
    setRemaining(Math.max(0, rem));
    const sec = Math.ceil(Math.max(0, rem) / 1000);
    if (sec !== lastSpoken.current && sec > 0 && (sec % 10 === 0 || sec <= 5)) {
      lastSpoken.current = sec;
      setAnnounce(`${sec} seconds left`);
      if (sec <= 5) sfx.tick();
    }
    if (rem <= 0) requestTimeout();
  });

  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(onTick, 100);
    return () => clearInterval(id);
  }, [phase, run.board]);

  // Enter starts a Board from its intro
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    if (phaseRef.current === "intro" && (e.key === "Enter" || e.key === " ") && (e.target as HTMLElement | null)?.tagName !== "BUTTON") {
      e.preventDefault();
      startBoard();
    }
    if (phaseRef.current === "play" && e.key === "Escape") {
      setSelTerm(null);
      setSelDef(null);
    }
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ------------------------------------------------------------------------------------
  // Keyboard on the cards: ↑↓ within a column, ←→ (or Tab) across, Enter/Space picks

  const alive = (side: Side) =>
    (side === "term" ? terms : defs).map((c, i) => ({ c, i })).filter(({ c }) => !isMatched(c.id, c.matched) && !links.some((l) => l.termId === c.id || l.defId === c.id));

  const focusSide = (side: Side, index: number) => {
    const list = alive(side);
    if (list.length === 0) return;
    const nearest = list.reduce((best, x) => (Math.abs(x.i - index) < Math.abs(best.i - index) ? x : best), list[0]);
    setFocus((f) => ({ ...f, [side]: nearest.i }));
    cardRefs.current.get(nearest.c.id)?.focus({ preventScroll: false });
  };

  const onCardKey = (e: ReactKeyboardEvent<HTMLButtonElement>, side: Side, index: number) => {
    const list = alive(side);
    const at = list.findIndex((x) => x.i === index);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const target = list[(at + step + list.length) % list.length] ?? list[0];
      setFocus((f) => ({ ...f, [side]: target.i }));
      cardRefs.current.get(target.c.id)?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      focusSide(side === "term" ? "def" : "term", index);
    }
  };

  const tabIndexFor = (side: Side, index: number) => {
    const list = alive(side);
    const want = side === "term" ? focus.term : focus.def;
    const target = list.some((x) => x.i === want) ? want : (list[0]?.i ?? -1);
    return target === index ? 0 : -1;
  };

  const fxFor = (side: Side, id: string, serverMatched: boolean): CardFx => {
    const l = links.find((x) => (side === "term" ? x.termId : x.defId) === id);
    if (l) return l.stage;
    if (isMatched(id, serverMatched)) return "ghost";
    if (phase === "timeup" || phase === "leaving") return "dead";
    if (miss?.ids.includes(id)) return "miss";
    if ((side === "term" ? selTerm : selDef) === id) return "selected";
    return "idle";
  };

  // ------------------------------------------------------------------------------------
  // Render

  const frac = Math.max(0, Math.min(1, remaining / PAIRS_BOARD_MS));
  const seconds = Math.ceil(remaining / 1000);
  const clockColor = frac > 0.5 ? "var(--success)" : frac > 0.25 ? "var(--reward)" : "var(--danger)";
  const hot = phase === "play" && remaining <= 10_000;
  const faceUp = !!current && phase !== "intro" && phase !== "dealing";
  const showBacks = !faceUp;

  const renderCard = (side: Side, c: { id: string; text: string; matched: boolean }, i: number) => {
    const fx = fxFor(side, c.id, c.matched);
    const link = links.find((l) => (side === "term" ? l.termId : l.defId) === c.id);
    const style = {
      gridRow: i + 1,
      gridColumn: side === "term" ? 1 : 2,
      ["--i" as string]: i,
      ...(fx === "fly" && link?.fly ? flyTransform(side === "term" ? link.fly.term : link.fly.def) : null),
    };
    const ghost = fx === "ghost";
    const label = side === "term" ? `Term: ${c.text}` : `Definition: ${c.text}`;
    return (
      <button
        key={c.id}
        ref={(el) => {
          if (el) cardRefs.current.set(c.id, el);
          else cardRefs.current.delete(c.id);
        }}
        type="button"
        data-side={side}
        data-state={fx}
        aria-pressed={fx === "selected"}
        aria-label={ghost ? `${label} (matched)` : label}
        disabled={ghost || fx === "dead" || phase !== "play"}
        tabIndex={tabIndexFor(side, i)}
        onClick={(e) => pick(side, c.id, e.detail === 0)}
        onKeyDown={(e) => onCardKey(e, side, i)}
        onFocus={() => setFocus((f) => ({ ...f, [side]: i }))}
        onMouseEnter={() => fx === "idle" && sfx.hover()}
        className={`${s.cardBtn} ${s.dealIn} ${
          side === "term"
            ? "min-h-[44px] w-auto px-3 py-2 font-display text-[16px] leading-tight font-semibold sm:min-h-[64px] sm:w-full sm:px-4 sm:text-[18px]"
            : "min-h-[56px] w-full py-2.5 pr-6 pl-3.5 font-sans text-[13.5px] leading-snug sm:min-h-[64px] sm:text-[14px]"
        }`}
        style={style}
      >
        <span className={s.pip} aria-hidden="true" />
        <span className="min-w-0 break-words">{c.text}</span>
      </button>
    );
  };

  return (
    <div data-theme="pairs" className={`${s.room} font-sans`}>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] sm:gap-5 sm:px-6 sm:pt-5">
        {/* HUD */}
        <header className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`/games/${context.gameId}`}
            className={`${s.plate} grid h-10 shrink-0 place-items-center px-3 font-hud text-[18px] text-muted hover:text-text`}
            aria-label={`Leave to ${context.gameTitle}`}
            title="Leave (the clock keeps running)"
          >
            ◂
          </Link>
          <div className={`${s.plate} flex h-10 shrink-0 items-center gap-2 px-3`}>
            <span className="font-hud text-[13px] tracking-[0.25em] text-muted">BOARD</span>
            <span className="font-hud text-[24px] leading-none text-reward">
              {run.board}
              <span className="text-[16px] text-faint">/{run.boardCount}</span>
            </span>
          </div>
          <div className="pointer-events-none hidden shrink-0 sm:block" aria-hidden="true">
            <Mascot ref={mascot} size={44} followCursor={false} sleepAfterMs={0} />
          </div>
          <div className="hidden min-w-0 flex-1 truncate font-display text-[15px] text-muted sm:block">{context.gameTitle}</div>
          <div className="flex-1 sm:hidden" />
          <div className={`${s.plate} flex h-10 shrink-0 items-center gap-2 px-3`} aria-label={`Score ${score}`}>
            <span className="font-hud text-[13px] tracking-[0.25em] text-muted">SCORE</span>
            <Odometer value={score} className="font-hud text-[26px] leading-none text-text" />
          </div>
          <SoundToggle className="shrink-0" />
        </header>

        {/* Clock */}
        <div className="flex items-center gap-3">
          <span
            className={`w-[54px] shrink-0 text-right font-hud text-[34px] leading-none tabular-nums ${hot ? s.clockHot : ""}`}
            style={{ color: clockColor, textShadow: "2px 2px 0 var(--ink)" }}
            aria-hidden="true"
          >
            {phase === "intro" || phase === "dealing" ? 60 : seconds}
          </span>
          <div className={`${s.clockTrack} flex-1`} key={`cut${cutKey}`} role="timer" aria-label={`${seconds} seconds left`}>
            <div className={`${s.clockFill} ${cutKey > 0 ? s.clockCut : ""} ${hot ? s.clockHot : ""}`} style={{ width: `${(phase === "intro" || phase === "dealing" ? 1 : frac) * 100}%`, ["--clock-color" as string]: clockColor }} />
          </div>
          <span className="hidden shrink-0 font-hud text-[16px] tracking-[0.2em] text-muted sm:inline">
            {matchedCount}/{perBoard} PAIRED
          </span>
        </div>

        {/* The table */}
        <div ref={tableRef} className={`${s.table} relative mt-1 px-3 py-4 sm:px-8 sm:py-6`}>
          <div className="mb-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-14 sm:grid">
            <p className="font-hud text-[15px] tracking-[0.3em] text-reward">◆ TERMS</p>
            <p className="font-hud text-[15px] tracking-[0.3em] text-[#cdb8ff]">■ DEFINITIONS</p>
          </div>

          {showBacks ? (
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-14 sm:gap-y-3" aria-hidden="true">
              <div className="flex flex-wrap gap-2 sm:contents">
                {Array.from({ length: perBoard }, (_, i) => (
                  <div key={`bt${i}`} data-side="term" className={`${s.back} h-[44px] w-[calc(50%-4px)] sm:h-[64px] sm:w-auto`} style={{ gridRow: i + 1, gridColumn: 1, ["--i" as string]: i }} />
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:contents">
                {Array.from({ length: perBoard }, (_, i) => (
                  <div key={`bd${i}`} data-side="def" className={`${s.back} h-[56px] sm:h-[64px]`} style={{ gridRow: i + 1, gridColumn: 2, ["--i" as string]: i + perBoard }} />
                ))}
              </div>
            </div>
          ) : (
            <div key={`board${run.board}`} className="flex flex-col gap-4 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-x-14 sm:gap-y-3">
              <p className="font-hud text-[14px] tracking-[0.12em] text-reward sm:hidden">◆ TERMS · TAP ONE, THEN ITS DEFINITION</p>
              <div role="group" aria-label="Terms" className="-mt-2 flex flex-wrap gap-2 sm:contents">
                {terms.map((t, i) => renderCard("term", t, i))}
              </div>
              <p className="font-hud text-[14px] tracking-[0.3em] text-[#cdb8ff] sm:hidden">■ DEFINITIONS</p>
              <div role="group" aria-label="Definitions" className="-mt-2 flex flex-col gap-2 sm:contents">
                {defs.map((d, i) => renderCard("def", d, i))}
              </div>
            </div>
          )}

          {/* link lines */}
          <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible" aria-hidden="true">
            {links.map((l) => {
              const len = Math.hypot(l.line.x2 - l.line.x1, l.line.y2 - l.line.y1);
              return (
                <g key={l.key} style={{ opacity: l.stage === "fly" ? 0 : 1, transition: "opacity .25s" }}>
                  <line x1={l.line.x1} y1={l.line.y1} x2={l.line.x2} y2={l.line.y2} className={s.link} style={{ ["--len" as string]: `${len}` }} />
                  <rect x={l.line.x1 - 5} y={l.line.y1 - 5} width={10} height={10} className={s.linkDots} />
                  <rect x={l.line.x2 - 5} y={l.line.y2 - 5} width={10} height={10} className={s.linkDots} />
                </g>
              );
            })}
          </svg>
          {pops.map((p) => (
            <span
              key={p.key}
              className={`${s.pop} text-[30px] sm:text-[36px]`}
              style={{ left: p.x, top: p.y, color: p.tone === "good" ? "var(--reward)" : "var(--danger)", textShadow: "2px 2px 0 var(--ink), 0 0 14px currentColor" }}
            >
              {p.text}
            </span>
          ))}

          {/* Overlays: intro, board clear, time */}
          {phase === "intro" || phase === "dealing" ? (
            <div className={s.overlay}>
              <div className={`${s.panel} w-full max-w-[420px] px-6 py-6 text-center`}>
                <p className="font-hud text-[16px] tracking-[0.35em]" style={{ color: "var(--card-muted)" }}>
                  BOARD {run.board} OF {run.boardCount}
                </p>
                <p className={`${s.bigWord} mt-1 text-[56px] sm:text-[64px]`} style={{ color: "var(--card-term)" }}>
                  MATCH
                </p>
                <p className="mt-2 text-[14px] leading-snug" style={{ color: "var(--card-ink)" }}>
                  Pick a term, then the definition it belongs to. {perBoard} pairs, 60 seconds.
                </p>
                <ul className="mt-3 flex flex-wrap justify-center gap-1.5 font-hud text-[16px]">
                  <li className="rounded-sm bg-[#2b1d0e] px-2 py-0.5 text-[#6dffb0]">+{PAIRS_MATCH_POINTS} a pair</li>
                  <li className="rounded-sm bg-[#2b1d0e] px-2 py-0.5 text-[#ff8a96]">−10 · −2 s a miss</li>
                  <li className="rounded-sm bg-[#2b1d0e] px-2 py-0.5 text-[#ffd166]">+{PAIRS_BONUS_PER_SECOND} per second left</li>
                </ul>
                {history.length > 0 && (
                  <p className="mt-3 font-hud text-[16px] tracking-[0.1em]" style={{ color: "var(--card-muted)" }}>
                    {history[history.length - 1]}
                  </p>
                )}
                <button
                  type="button"
                  autoFocus
                  onClick={startBoard}
                  disabled={phase === "dealing"}
                  className="px-btn mt-5 h-14 px-8 text-[22px]"
                  data-variant="primary"
                >
                  {phase === "dealing" ? "DEALING…" : "MATCH ▶"}
                </button>
                <p className="mt-3 hidden font-hud text-[15px] tracking-[0.15em] sm:block" style={{ color: "var(--card-muted)" }}>
                  ENTER TO DEAL · ↑↓ ←→ MOVE · ENTER PICKS
                </p>
              </div>
            </div>
          ) : null}
          {phase === "cleared" && boardEnd?.kind === "cleared" && (
            <div className={s.overlay}>
              <div className={`${s.panel} w-full max-w-[420px] px-6 py-6 text-center`}>
                <p className={`${s.bigWord} text-[38px] whitespace-nowrap sm:text-[46px]`} style={{ color: "#3ddc97" }}>
                  BOARD CLEAR
                </p>
                <p className="mt-2 font-hud text-[22px]" style={{ color: "var(--card-muted)" }}>
                  +{PAIRS_BONUS_PER_SECOND} × {boardEnd.seconds} s left
                </p>
                <p className="font-hud text-[64px] leading-none tabular-nums" style={{ color: "var(--card-term)", textShadow: "3px 3px 0 var(--ink)" }}>
                  +{bonusShown}
                </p>
                <p className="mt-2 font-hud text-[18px] tracking-[0.25em]" style={{ color: "var(--card-muted)" }}>
                  {boardEnd.nextBoard ? `BOARD ${boardEnd.nextBoard} NEXT…` : "ALL PAIRS!"}
                </p>
              </div>
            </div>
          )}
          {phase === "timeup" && boardEnd?.kind === "timeup" && (
            <div className={s.overlay}>
              <div className={`${s.panel} w-full max-w-[380px] px-6 py-6 text-center`}>
                <p className={`${s.bigWord} text-[64px]`} style={{ color: "#ff5c6c" }}>
                  Time!
                </p>
                <p className="mt-2 font-hud text-[22px]" style={{ color: "var(--card-muted)" }}>
                  {boardEnd.matched} OF {perBoard} PAIRED
                </p>
                <p className="mt-1 text-[13px]" style={{ color: "var(--card-ink)" }}>
                  The rest are in the results.
                </p>
              </div>
            </div>
          )}
          {phase === "leaving" && (
            <div className={s.overlay}>
              <div className="text-center">
                <p className={`${s.bigWord} text-[56px] sm:text-[72px]`} style={{ color: boardEnd?.kind === "cleared" ? "var(--reward)" : "var(--text)" }}>
                  {boardEnd?.kind === "cleared" ? "ALL PAIRS!" : "TIME!"}
                </p>
                <p className="mt-3 font-hud text-[20px] tracking-[0.3em] text-muted" style={{ animation: "title-flicker 1.6s ease-in-out infinite" }}>
                  LAYING OUT THE TABLE…
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Matched tray */}
        <section className={`${s.tray} rounded-md px-3 py-3 sm:px-4`} aria-label="Matched pairs">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-hud text-[15px] tracking-[0.3em] text-muted">MATCHED</p>
            <p className="font-hud text-[15px] tracking-[0.2em] text-muted sm:hidden">
              {matchedCount}/{perBoard}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: perBoard }, (_, i) => {
              const item = tray[i];
              return (
                <div key={i} ref={(el) => void (slotRefs.current[i] = el)} className={item ? "" : s.slot}>
                  {item && (
                    <div className={s.chip} title={item.def}>
                      <span className="font-hud text-[16px] text-[#1f9e64]">✓</span>
                      <span className="min-w-0 truncate font-display text-[14px] font-semibold">{item.term}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {notice && (
          <p className="text-center font-hud text-[18px] text-caution" role="alert">
            {notice}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </div>
    </div>
  );
}

function flyTransform({ dx, dy }: { dx: number; dy: number }) {
  return { transform: `translate(${dx}px, ${dy}px) scale(0.25) rotate(${dx > 0 ? 8 : -8}deg)`, opacity: 0 };
}

function initialTray(st: PairsRunState): (TrayItem | null)[] {
  const out: (TrayItem | null)[] = Array.from({ length: st.pairsPerBoard }, () => null);
  const c = st.current;
  if (!c) return out;
  c.matches.forEach((m, i) => {
    const t = c.terms.find((x) => x.id === m.termId);
    const d = c.definitions.find((x) => x.id === m.definitionId);
    if (i < out.length) out[i] = { term: t?.text ?? "", def: d?.text ?? "" };
  });
  return out;
}
