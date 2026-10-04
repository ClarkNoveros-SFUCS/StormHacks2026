"use client";
import { createContext, useContext, useState } from "react";
import type { Evidence, PromptKind, RevealPrompt } from "@/lib/runs/types";
import { TIER_POINTS, type Tier } from "@/lib/scoring/tiers";
import { sfx } from "@/lib/ui/sfx";
import { PixelIcon, type PixelIconName } from "@/components/ui/PixelIcon";
import { promptTier, TIER_ORDER, TIER_UI as DIVE_TIERS, type TierKey } from "@/components/modes/dive/tiers";
import { EvidenceLine } from "./EvidenceLine";

const KIND_LABEL: Record<PromptKind, string> = {
  open: "OPEN",
  cloze: "FILL THE BLANK",
  definition_to_term: "NAME THE TERM",
  ordered_recall: "PUT IN ORDER",
  odd_one_out: "ODD ONE OUT",
  multiple_choice: "MULTIPLE CHOICE",
  true_false: "TRUE OR FALSE",
};

type EvidenceHref = (evidence: NonNullable<Evidence>) => string | null;

type Props = {
  prompts: RevealPrompt[];
  title?: string;
  /** Link each Evidence line (the Module's file viewer). */
  evidenceHref?: EvidenceHref;
  /** Tier names, colours and icons (default: Dive's Shallows/Reef/Abyss/Trench; Apogee passes its own). */
  tiers?: ResultTiers;
  className?: string;
};

export type ResultTiers = Record<TierKey, { label: string; color: string; hex: string; icon: PixelIconName }>;
const TiersContext = createContext<ResultTiers>(DIVE_TIERS);

function TierIcon({ tier, size = 16 }: { tier: TierKey; size?: number }) {
  const TIER_UI = useContext(TiersContext);
  const ui = TIER_UI[tier];
  return <PixelIcon name={ui.icon} size={size} palette={{ c: ui.hex, b: ui.hex, v: ui.hex, y: ui.hex }} title={ui.label} />;
}

/** THE CATCH: one row per Prompt, expandable. Open Prompts list every Answer with filters and search. */
export function ResultList({ tiers = DIVE_TIERS, ...props }: Props) {
  return (
    <TiersContext value={tiers}>
      <List {...props} />
    </TiersContext>
  );
}

function List({ prompts, title = "THE CATCH · tap a prompt for every answer", evidenceHref, className = "" }: Props) {
  const TIER_UI = useContext(TiersContext);
  const [open, setOpen] = useState<number | null>(prompts[0]?.position ?? null);
  return (
    <section className={`w-full ${className}`}>
      <h3 className="label-line">{title}</h3>
      <ul className="mt-3 flex flex-col gap-2">
        {prompts.map((p) => {
          const t = promptTier(p);
          const isOpen = open === p.position;
          return (
            <li key={p.position} className="dv-panel">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  sfx.click();
                  setOpen(isOpen ? null : p.position);
                }}
                className="flex w-full items-center gap-3 px-3 py-3 text-left sm:px-4"
              >
                <TierIcon tier={t} size={20} />
                <span className="min-w-0 flex-1">
                  <span className="block font-hud text-[12px] tracking-[0.25em] text-muted">
                    PROMPT {String(p.position).padStart(2, "0")} · {KIND_LABEL[p.kind]}
                  </span>
                  <span className="block truncate font-hud text-[19px] text-text sm:text-[21px]">{p.text}</span>
                  <span className="block truncate font-hud text-[16px] text-muted">
                    {p.yourAnswer ? `you: ${p.yourAnswer}` : p.outcome === "timeout" ? "time ran out" : "no answer"}
                    {p.hintUsed && <span className="ml-2 text-caution">HINT</span>}
                    {p.stale && <span className="ml-2 text-faint">REPEAT ÷2</span>}
                  </span>
                </span>
                <span className="font-hud text-[22px] tabular-nums" style={{ color: TIER_UI[t].color }}>
                  {p.points > 0 ? `+${p.points}` : "0"}
                </span>
                <span aria-hidden="true" className="font-hud text-muted" style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform .2s" }}>
                  ▸
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-white/10 px-3 pt-3 pb-4 sm:px-4" style={{ animation: "rise-in .35s var(--ease-out) both" }}>
                  {p.kind === "open" && p.answers ? <OpenAnswers answers={p.answers} evidenceHref={evidenceHref} /> : <SingleAnswer p={p} evidenceHref={evidenceHref} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function OpenAnswers({ answers, evidenceHref }: { answers: NonNullable<RevealPrompt["answers"]>; evidenceHref?: EvidenceHref }) {
  const TIER_UI = useContext(TiersContext);
  const [filter, setFilter] = useState<Tier | "all">("all");
  const [q, setQ] = useState("");
  const counts = Object.fromEntries(TIER_ORDER.map((t) => [t, answers.filter((a) => a.tier === t).length])) as Record<Tier, number>;
  const rarestFirst = [...answers].sort((a, b) => TIER_ORDER.indexOf(b.tier) - TIER_ORDER.indexOf(a.tier));
  const shown = rarestFirst.filter((a) => (filter === "all" || a.tier === filter) && a.answer.toLowerCase().includes(q.trim().toLowerCase()));
  const chips: { id: Tier | "all"; label: string; n: number; color: string }[] = [
    { id: "all", label: "ALL", n: answers.length, color: "var(--text)" },
    ...[...TIER_ORDER].reverse().map((t) => ({ id: t, label: TIER_UI[t].label.toUpperCase(), n: counts[t], color: TIER_UI[t].color })),
  ];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
            className="px-2 py-0.5 font-hud text-[14px] tracking-[0.12em] transition"
            style={{
              color: c.color,
              boxShadow: `inset 0 0 0 ${filter === c.id ? 2 : 1}px color-mix(in srgb, ${c.color} ${filter === c.id ? 90 : 35}%, transparent)`,
              background: filter === c.id ? `color-mix(in srgb, ${c.color} 12%, transparent)` : undefined,
            }}
          >
            {c.label} {c.n}
          </button>
        ))}
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search answers…"
        aria-label="Search answers"
        className="mt-3 w-full bg-[#060d1a] px-3 py-1.5 font-hud text-[17px] text-text outline-none placeholder:text-faint"
        style={{ boxShadow: "inset 0 0 0 1px var(--dive-rim, #1b3050)" }}
      />
      <ul className="mt-3 flex flex-col gap-2.5">
        {shown.map((a) => (
          <li key={a.answer} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 font-hud text-[19px]">
              <TierIcon tier={a.tier} size={14} />
              <span className={a.found ? "text-text" : "text-muted"}>{a.answer}</span>
              {a.found && <span className="text-[15px] text-success">✓ yours</span>}
              <span className="ml-auto tabular-nums" style={{ color: TIER_UI[a.tier].color }}>
                +{TIER_POINTS[a.tier]}
              </span>
            </div>
            <EvidenceLine evidence={a.evidence} href={a.evidence && evidenceHref?.(a.evidence)} className="pl-6" />
          </li>
        ))}
        {shown.length === 0 && <li className="font-hud text-[17px] text-faint">Nothing matches.</li>}
      </ul>
    </div>
  );
}

function SingleAnswer({ p, evidenceHref }: { p: RevealPrompt; evidenceHref?: EvidenceHref }) {
  const TIER_UI = useContext(TiersContext);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-hud text-[19px] text-text">
        <span className="text-muted">Answer: </span>
        {p.correctOrder ? p.correctOrder.join(" → ") : p.correctAnswer}
        {p.tier && (
          <span className="ml-2 text-[15px]" style={{ color: TIER_UI[p.tier].color }}>
            {TIER_UI[p.tier].label.toUpperCase()} · +{TIER_POINTS[p.tier]}
          </span>
        )}
      </p>
      {p.explanation && <p className="font-sans text-[14px] leading-relaxed text-muted">{p.explanation}</p>}
      <EvidenceLine evidence={p.evidence ?? null} href={p.evidence && evidenceHref?.(p.evidence)} />
    </div>
  );
}
