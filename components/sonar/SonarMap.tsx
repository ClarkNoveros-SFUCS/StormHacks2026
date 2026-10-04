"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { openSonar } from "@/lib/sonar/client";
import type { ConceptState, ConceptStatus, SonarModel } from "@/lib/sonar/types";
import { ActionCard } from "./ActionCard";
import { SonarMascot } from "./SonarMascot";
import s from "./sonar.module.css";

// The /sonar mastery map (F32, #73): the Python Basics Concept DAG as a deep-ocean sonar chart.
// Every number on it comes from the learner model (lib/sonar/model.ts), never from the agent.

const LANE_W = 196;
const GAP = 18;
const PAD = 16;
const NODE_W = 174;
const NODE_H = 86;
const HEAD = 92;
const ROW = 108;

const STATUS: Record<ConceptStatus, { color: string; label: string; hint: string }> = {
  mastered: { color: "var(--success)", label: "Mastered", hint: "≥ 85% and seen 3+ times" },
  learning: { color: "var(--reward)", label: "Learning", hint: "50–85%" },
  weak: { color: "var(--caution)", label: "Weak", hint: "under 50%" },
  unseen: { color: "var(--faint)", label: "Unseen", hint: "no guesses yet" },
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const bar = (x: number) => {
  const k = Math.max(0, Math.min(10, Math.round(x * 10)));
  return "█".repeat(k) + "░".repeat(10 - k);
};

type Pos = { x: number; y: number; lane: number; row: number };

function reach(start: Iterable<string>, next: Map<string, string[]>): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const id = stack.pop()!;
    for (const n of next.get(id) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return seen;
}

export function SonarMap({ model }: { model: SonarModel }) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const focus = hover ?? pinned;

  const byId = useMemo(() => new Map(model.concepts.map((c) => [c.id, c])), [model.concepts]);
  const topics = useMemo(() => [...model.topics].sort((a, b) => a.number - b.number), [model.topics]);

  const pos = useMemo(() => {
    const m = new Map<string, Pos>();
    topics.forEach((t, lane) => {
      model.concepts
        .filter((c) => c.topicSlug === t.slug)
        .forEach((c, row) => {
          m.set(c.id, { x: PAD + lane * (LANE_W + GAP) + (LANE_W - NODE_W) / 2, y: HEAD + row * ROW, lane, row });
        });
    });
    return m;
  }, [topics, model.concepts]);

  const rows = Math.max(1, ...[...pos.values()].map((p) => p.row + 1));
  const width = PAD * 2 + topics.length * LANE_W + (topics.length - 1) * GAP;
  const height = HEAD + rows * ROW + 8;

  // The root cause's blame path: edges from it toward the Concepts the misses were on.
  const blameEdges = useMemo(() => {
    const rc = model.rootCause;
    if (!rc) return new Set<string>();
    const fwd = new Map<string, string[]>();
    const back = new Map<string, string[]>();
    for (const [a, b] of model.edges) {
      fwd.set(a, [...(fwd.get(a) ?? []), b]);
      back.set(b, [...(back.get(b) ?? []), a]);
    }
    const down = reach([rc.conceptId], fwd);
    const up = new Set([...rc.missedOn, ...reach(rc.missedOn, back)]);
    const out = new Set<string>();
    for (const [a, b] of model.edges) {
      if ((a === rc.conceptId || (down.has(a) && up.has(a))) && down.has(b) && up.has(b)) out.add(`${a}>${b}`);
    }
    return out;
  }, [model.edges, model.rootCause]);

  const rootId = model.rootCause?.conceptId ?? null;
  const top = model.actions[0];
  const recId = top && top.kind === "play" ? top.conceptId : null;
  const missed = new Set(model.rootCause?.missedOn ?? []);

  function edgePath(a: Pos, b: Pos) {
    const y1 = a.y + NODE_H / 2;
    const y2 = b.y + NODE_H / 2;
    if (a.lane === b.lane) {
      const x = a.x;
      return `M ${x} ${y1} C ${x - 34} ${y1}, ${x - 34} ${y2}, ${x} ${y2}`;
    }
    const x1 = a.lane < b.lane ? a.x + NODE_W : a.x;
    const x2 = a.lane < b.lane ? b.x : b.x + NODE_W;
    const dx = (x2 - x1) / 2;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }

  const focused = focus ? byId.get(focus) : undefined;
  const fpos = focus ? pos.get(focus) : undefined;

  return (
    <div className={`relative overflow-x-auto overscroll-x-contain rounded-lg border border-border-strong ${s.chart}`}>
      <div className={`relative ${s.grid}`} style={{ width, height }} onPointerLeave={() => setHover(null)}>
        {/* the sweep */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className={`absolute opacity-60 ${s.sweep}`} style={{ width: height * 2, height: height * 2, left: width / 2 - height, top: -height / 2 }} />
        </div>

        {/* Topic lanes */}
        {topics.map((t, lane) => {
          const disagree = t.coursePassed && t.sonarMastery < 0.7;
          return (
            <div
              key={t.slug}
              className="absolute top-2 rounded-md border"
              style={{
                left: PAD + lane * (LANE_W + GAP),
                width: LANE_W,
                height: height - 16,
                borderColor: disagree ? "color-mix(in srgb, var(--caution) 55%, transparent)" : "color-mix(in srgb, var(--signal) 12%, transparent)",
                background: disagree ? "color-mix(in srgb, var(--caution) 7%, transparent)" : "color-mix(in srgb, var(--surface) 35%, transparent)",
              }}
            >
              <div className="px-2.5 pt-2">
                <p className="truncate font-display text-[14px] text-text" title={t.title}>
                  <span className="text-faint">{t.number} · </span>
                  {t.title}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Chip tone={t.coursePassed ? "success" : "neutral"}>Course: {t.coursePassed ? "Passed ✓" : "Not yet"}</Chip>
                  <Chip tone={disagree ? "caution" : t.sonarMastery >= 0.85 ? "success" : "signal"}>
                    {disagree ? "⚠ " : ""}Sonar: {pct(t.sonarMastery)}
                  </Chip>
                </div>
                {disagree && <span className="sr-only">The Course says passed, Sonar disagrees.</span>}
              </div>
            </div>
          );
        })}

        {/* Prerequisite edges */}
        <svg className="pointer-events-none absolute inset-0" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="sonar-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="#4de3ff" opacity=".5" />
            </marker>
          </defs>
          {model.edges.map(([a, b]) => {
            const pa = pos.get(a);
            const pb = pos.get(b);
            if (!pa || !pb) return null;
            const key = `${a}>${b}`;
            const hot = blameEdges.has(key);
            const lit = focus === a || focus === b;
            const d = edgePath(pa, pb);
            return hot ? (
              <g key={key}>
                <path d={d} fill="none" stroke="var(--danger)" strokeOpacity=".35" strokeWidth="4" />
                <path d={d} fill="none" stroke="var(--danger)" strokeWidth="2" className={s.blame} />
              </g>
            ) : (
              <path
                key={key}
                d={d}
                fill="none"
                stroke="var(--signal)"
                strokeOpacity={lit ? 0.85 : focus ? 0.08 : 0.22}
                strokeWidth={lit ? 2 : 1.25}
                markerEnd="url(#sonar-arrow)"
              />
            );
          })}
        </svg>

        {/* Concept nodes */}
        {model.concepts.map((c) => {
          const p = pos.get(c.id);
          if (!p) return null;
          return (
            <ConceptNode
              key={c.id}
              c={c}
              p={p}
              root={c.id === rootId}
              rec={c.id === recId}
              missed={missed.has(c.id)}
              dim={!!focus && focus !== c.id}
              onHover={setHover}
              onTap={() => setPinned((x) => (x === c.id ? null : c.id))}
              pinned={pinned === c.id}
            />
          );
        })}

        {/* Tooltip */}
        {focused && fpos && (
          <div
            role="tooltip"
            id={`sonar-tip-${focused.id}`}
            className="pointer-events-none absolute z-20 w-[220px] rounded-md border-2 border-border-strong bg-surface-2 p-3 text-[13px] shadow-2xl"
            style={{
              left: Math.min(fpos.x, width - 228),
              top: fpos.row >= 2 ? fpos.y - 8 : fpos.y + NODE_H + 8,
              transform: fpos.row >= 2 ? "translateY(-100%)" : undefined,
            }}
          >
            <p className="font-display text-[14px] text-text">{focused.name}</p>
            <p className="mb-2 text-faint">{focused.summary}</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-hud text-[17px] leading-tight">
              <dt className="text-muted">p (known)</dt>
              <dd className="text-right text-text">{pct(focused.p)}</dd>
              <dt className="text-muted">pEff (today)</dt>
              <dd className="text-right text-text">{pct(focused.pEff)}</dd>
              <dt className="text-muted">guesses n</dt>
              <dd className="text-right text-text">{focused.n}</dd>
              <dt className="text-muted">right / wrong</dt>
              <dd className="text-right text-text">
                <span className="text-success">{focused.right}</span> / <span className="text-danger">{focused.wrong}</span>
              </dd>
              <dt className="text-muted">blame</dt>
              <dd className="text-right" style={{ color: focused.blame > 0 ? "var(--danger)" : "var(--text)" }}>
                {pct(focused.blame)}
              </dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

function ConceptNode({
  c,
  p,
  root,
  rec,
  missed,
  dim,
  pinned,
  onHover,
  onTap,
}: {
  c: ConceptState;
  p: Pos;
  root: boolean;
  rec: boolean;
  missed: boolean;
  dim: boolean;
  pinned: boolean;
  onHover: (id: string | null) => void;
  onTap: () => void;
}) {
  const st = STATUS[c.status];
  // Ring brightness = confidence: more guesses, brighter ring.
  const conf = c.n === 0 ? 0.2 : Math.min(1, 0.3 + c.n / 10);
  return (
    <button
      type="button"
      onPointerEnter={() => onHover(c.id)}
      onFocus={() => onHover(c.id)}
      onBlur={() => onHover(null)}
      onClick={onTap}
      aria-pressed={pinned}
      aria-label={`${c.name}: ${st.label}, ${pct(c.pEff)} after ${c.n} guesses${root ? ", root cause" : ""}${rec ? ", recommended next" : ""}`}
      className={`absolute z-10 rounded-md bg-surface/95 px-2.5 py-2 text-left transition-[opacity,transform] duration-200 hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-signal ${
        root ? s.root : rec ? s.lantern : ""
      }`}
      style={{
        left: p.x,
        top: p.y,
        width: NODE_W,
        height: NODE_H,
        opacity: dim ? 0.55 : 1,
        border: `2px solid color-mix(in srgb, ${st.color} ${Math.round(conf * 100)}%, transparent)`,
      }}
    >
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: st.color, opacity: Math.max(0.4, conf) }} />
        <span className="truncate font-display text-[13px] leading-tight text-text">{c.name}</span>
      </span>
      <span className="mt-1 flex items-baseline justify-between gap-2 font-hud text-[16px] leading-none">
        <span aria-hidden="true" style={{ color: st.color }} className="tracking-[-0.05em]">
          {bar(c.pEff)}
        </span>
        <span className="text-text">{c.n ? pct(c.pEff) : "—"}</span>
      </span>
      <span className="mt-1.5 flex items-center gap-1 text-[11px] leading-none">
        {root ? (
          <span className="font-display tracking-wider text-danger uppercase">◎ Root cause</span>
        ) : rec ? (
          <span className="font-display tracking-wider text-primary uppercase">✦ Practise next</span>
        ) : missed ? (
          <span className="font-display tracking-wider text-caution uppercase">✕ Misses here</span>
        ) : (
          <span className="text-faint">
            {st.label} · n={c.n}
          </span>
        )}
      </span>
    </button>
  );
}

/** The whole /sonar body: hero, map, side panel. */
export function SonarPageClient({ model }: { model: SonarModel }) {
  const byId = new Map(model.concepts.map((c) => [c.id, c]));
  const rc = model.rootCause ? byId.get(model.rootCause.conceptId) : undefined;
  const weakest = [...model.concepts].filter((c) => c.n > 0).sort((a, b) => a.pEff - b.pEff)[0];
  const spot = rc ?? weakest;
  const missedNames = (model.rootCause?.missedOn ?? []).map((id) => byId.get(id)?.name ?? id);

  if (model.observations === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-5 py-16 text-center">
        <SonarMascot size={160} mood="idle" label="Sonar the dolphin" />
        <h1 className="font-display text-3xl text-text">Your map is still dark</h1>
        <p className="text-[15px] text-muted">Play a Python Basics Topic and I&apos;ll start mapping what you know.</p>
        <Button variant="primary" href="/explore/python-basics">
          Open Python Basics
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 rounded-lg border border-border bg-[linear-gradient(135deg,#0b1a36,#141a33)] p-5 sm:flex-row sm:items-center">
        <SonarMascot size={120} mood={spot ? "talking" : "happy"} label="Sonar the dolphin" />
        <div className="min-w-0 flex-1">
          <p className="label-line font-display text-[13px] tracking-[.2em] text-signal uppercase">Sonar · Python Basics</p>
          <h1 className="mt-1 font-display text-2xl leading-tight text-text sm:text-3xl">
            {spot ? (
              <>
                Your weak spot: <span className="text-danger">{spot.name}</span> <span className="font-hud text-[1.15em] text-muted">({pct(spot.pEff)})</span>
              </>
            ) : (
              "Your map looks clear. Nice."
            )}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {rc && model.rootCause && missedNames.length > 0
              ? `It's behind your misses on ${missedNames.join(" and ")}: ${pct(model.rootCause.blameShare)} of the blame for your last misses lands on it.`
              : "Every number here comes from your own guesses."}{" "}
            <span className="text-faint">Mapped from {model.observations} guesses.</span>
          </p>
        </div>
        {spot && (
          <Button variant="primary" onClick={() => openSonar({ message: "Why is that my weak spot?" })}>
            Ask Sonar why
          </Button>
        )}
      </header>

      <section aria-label="Mastery map" className="min-w-0">
        <SonarMap model={model} />
        <p className="mt-2 text-[13px] text-faint">Hover or tap a Concept for its numbers. Arrows point from a prerequisite to what builds on it.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <h2 className="mb-2 font-display text-xl text-text">What to do next</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {model.actions.slice(0, 3).map((a, i) => (
              <ActionCard key={i} action={a} index={i} />
            ))}
            {model.actions.length === 0 && <p className="text-[14px] text-muted">Nothing queued. Play anything and I&apos;ll update.</p>}
          </div>
        </section>
        <aside>
          <div className="rounded-md border border-border bg-surface p-4">
            <h2 className="mb-2 font-display text-[15px] text-text">Reading the map</h2>
            <ul className="space-y-1.5 text-[13px] text-muted">
              {(Object.keys(STATUS) as ConceptStatus[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 rounded-[2px]" style={{ background: STATUS[k].color }} />
                  <span>
                    <span className="text-text">{STATUS[k].label}</span> {STATUS[k].hint}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-[2px] border-2 border-danger" />
                <span>
                  <span className="text-text">Root cause</span>: red dashes show blame flowing back to it
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-[2px] border-2 border-primary" />
                <span>
                  <span className="text-text">Practise next</span> (the top pick)
                </span>
              </li>
              <li>Brighter ring = more guesses seen, so I&apos;m more sure.</li>
            </ul>
            <p className="mt-3 border-t border-border pt-3 text-[13px] text-muted">
              <span className="font-display text-signal">The Mode sets the guess rate:</span> a right 50/50 in Blitz counts for less than a typed answer in Dive.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
