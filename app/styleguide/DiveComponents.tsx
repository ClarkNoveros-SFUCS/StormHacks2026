"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { PixelIcon } from "@/components/ui/PixelIcon";
import { HudPlate } from "@/components/round/HudPlate";
import { ProgressSquares } from "@/components/round/ProgressSquares";
import { RoundCard } from "@/components/round/RoundCard";
import { SonarTimer } from "@/components/round/SonarTimer";
import { Fuse } from "@/components/round/Fuse";
import { TypedInput } from "@/components/round/TypedInput";
import { OptionGrid } from "@/components/round/OptionGrid";
import { OrderList } from "@/components/round/OrderList";
import { HintButton } from "@/components/round/HintButton";
import { ResultChip } from "@/components/round/ResultChip";
import { ResultHeader } from "@/components/results/ResultHeader";
import { DistributionChart } from "@/components/results/DistributionChart";
import { BandTable } from "@/components/results/BandTable";
import { ResultList } from "@/components/results/ResultList";
import { EvidenceLine } from "@/components/results/EvidenceLine";
import { DiveLogChart } from "@/components/modes/dive/DiveLogChart";
import { BEARING, TIER_UI, bearingIndex, formatDepth } from "@/components/modes/dive/tiers";
import type { RevealPrompt } from "@/lib/runs/types";

const EVIDENCE = { documentId: "00000000-0000-0000-0000-000000000000", documentTitle: "Week 9 slides", pageNumber: 41, quote: "Hopcroft–Karp finds a maximum matching in O(E√V)." };

const PROMPTS: RevealPrompt[] = [
  {
    position: 1,
    kind: "open",
    text: "Name a graph algorithm",
    outcome: "correct",
    points: 100,
    hintUsed: false,
    stale: false,
    yourAnswer: "Hopcroft–Karp",
    answers: [
      { answer: "Dijkstra", tier: "common", found: false, evidence: { ...EVIDENCE, pageNumber: 12, quote: null } },
      { answer: "Kruskal", tier: "solid", found: false, evidence: { ...EVIDENCE, pageNumber: 22, quote: null } },
      { answer: "Floyd–Warshall", tier: "deep", found: false, evidence: { ...EVIDENCE, pageNumber: 30, quote: null } },
      { answer: "Hopcroft–Karp", tier: "rare", found: true, evidence: EVIDENCE },
    ],
  },
  {
    position: 2,
    kind: "cloze",
    text: "Dijkstra fails with negative ____ weights.",
    outcome: "correct",
    points: 25,
    hintUsed: true,
    stale: false,
    yourAnswer: "edge",
    tier: "solid",
    correctAnswer: "edge",
    explanation: "A negative edge can make an already-settled node cheaper.",
    evidence: { ...EVIDENCE, pageNumber: 14, quote: "Dijkstra assumes non-negative edge weights." },
  },
  {
    position: 3,
    kind: "odd_one_out",
    text: "Which is not a shortest-path algorithm?",
    outcome: "wrong",
    points: 0,
    hintUsed: false,
    stale: false,
    yourAnswer: "Bellman–Ford",
    tier: "deep",
    correctAnswer: "Prim",
    explanation: "Prim builds a minimum spanning tree.",
    evidence: { ...EVIDENCE, pageNumber: 20, quote: null },
  },
];

const BANDS = BEARING.map((b) => ({ range: b.range, label: b.label, verdict: b.verdict, icon: TIER_UI[b.tier].icon, color: TIER_UI[b.tier].hex }));
const PAST = [90, 120, 140, 160, 180, 210, 220, 240, 260, 300, 340, 410];

function Box({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <p className="font-hud text-[13px] tracking-[0.25em] text-muted uppercase">{title}</p>
      {children}
    </div>
  );
}

/** Static demos of the round, results and Dive blocks, inside data-theme="dive". */
export function DiveComponents() {
  const [left, setLeft] = useState(18000);
  const [reject, setReject] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [order, setOrder] = useState(["Sort edges", "Pick the lightest", "Skip cycles", "Stop at V−1 edges"]);
  const [hint, setHint] = useState(false);
  const [score, setScore] = useState(125);

  useEffect(() => {
    const id = setInterval(() => setLeft((l) => (l <= 0 ? 25000 : l - 100)), 100);
    return () => clearInterval(id);
  }, []);

  return (
    <div data-theme="dive" className="dv-panel relative flex flex-col gap-10 bg-bg p-4 font-hud sm:p-6">
      <Box title="HUD">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <HudPlate label="DEPTH" value={formatDepth(score).replace("−", "")} tone="signal" />
          <ProgressSquares total={7} current={4} results={["done", "gold", "miss"]} caption="PROMPT 4 OF 7" />
          <HudPlate label="SCORE" value={score} tone="accent" />
        </div>
        <Button size="sm" variant="ghost" onClick={() => setScore((s) => s + 60)} className="self-center">
          +60
        </Button>
      </Box>

      <Box title="RoundCard + dock">
        <RoundCard
          label="PROMPT 4 OF 7"
          text="Name a graph algorithm"
          footer="▼ rarer answers sink deeper ▼"
          hint={hint ? "Think matchings in bipartite graphs." : null}
        />
        <div className="flex flex-wrap items-start justify-center gap-4">
          <SonarTimer remainingMs={left} totalMs={25000} sound={false} />
          <TypedInput
            className="min-w-0 flex-1"
            onSubmit={() => setReject((r) => r + 1)}
            correction={reject ? "dijkstr · not in your notes" : null}
            rejectKey={reject}
            below={<Fuse remainingMs={left} totalMs={25000} />}
          />
        </div>
        <div className="flex justify-center">
          <HintButton from="deep" to="solid" used={hint} onUse={() => setHint(true)} />
        </div>
      </Box>

      <div className="grid gap-8 md:grid-cols-2">
        <Box title="OptionGrid (odd one out)">
          <OptionGrid options={["Dijkstra", "Bellman–Ford", "Prim", "A*"]} onPick={setPicked} locked={!!picked} correct={picked ? "Prim" : null} picked={picked} />
          {picked && (
            <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
              Reset
            </Button>
          )}
        </Box>
        <Box title="OrderList (put in order)">
          <OrderList items={order} onChange={setOrder} />
        </Box>
      </div>

      <Box title="ResultChip per tier">
        <div className="flex flex-wrap gap-4">
          {(["common", "solid", "deep", "rare"] as const).map((t) => (
            <ResultChip key={t} text={TIER_UI[t].label} band={TIER_UI[t].band} points={TIER_UI[t].points} />
          ))}
          <ResultChip text="Kruskal" band={2} points={12} stale />
          <ResultChip text="edge" band={1} points={10} hinted />
        </div>
      </Box>

      <Box title="Results">
        <ResultHeader title="DIVE #12 COMPLETE" score={125} secondary={formatDepth(125)} personalBest logo={<PixelIcon name="lantern" size={20} />} />
        <DistributionChart values={PAST} you={125} caption="YOUR LAST 12 DIVES" />
        <DiveLogChart prompts={PROMPTS.map((p) => ({ points: p.points, tier: p.outcome === "correct" ? (p.tier ?? "rare") : "miss" }))} />
        <BandTable bands={BANDS} activeIndex={bearingIndex(125)} />
        <ResultList prompts={PROMPTS} />
        <EvidenceLine evidence={EVIDENCE} />
      </Box>

      <div className="flex justify-center">
        <Button variant="primary" size="lg" href="/styleguide/dive">
          ▼ OPEN THE DIVE PLAYGROUND ▼
        </Button>
      </div>
    </div>
  );
}
