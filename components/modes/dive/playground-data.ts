// Fake Prompts and local matching for the /styleguide Dive playground (no API, no DB).
// Not the real matcher (lib/matching/): just close enough to play.
import type { Evidence } from "@/lib/runs/types";
import type { Tier } from "@/lib/scoring/tiers";

type Ans = { answer: string; aliases?: string[]; tier: Tier; evidence: Evidence };
type Single = { tier: Tier; hint: string; explanation: string; evidence: Evidence };

export type FakePrompt =
  | { kind: "open"; text: string; answers: Ans[] }
  | ({ kind: "cloze" | "definition_to_term"; text: string; answer: string; aliases?: string[] } & Single)
  | ({ kind: "odd_one_out"; text: string; options: string[]; answer: string } & Single)
  | ({ kind: "ordered_recall"; text: string; items: string[] } & Single);

const ev = (page: number, quote: string): Evidence => ({ documentId: "playground", documentTitle: "Playground notes", pageNumber: page, quote });

export const PLAYGROUND_PROMPTS: FakePrompt[] = [
  {
    kind: "open",
    text: "Name a sorting algorithm",
    answers: [
      { answer: "Quicksort", aliases: ["quick sort"], tier: "common", evidence: ev(3, "Quicksort partitions around a pivot.") },
      { answer: "Merge sort", aliases: ["mergesort"], tier: "common", evidence: ev(3, "Merge sort splits, sorts and merges.") },
      { answer: "Bubble sort", aliases: ["bubblesort"], tier: "common", evidence: ev(2, "Bubble sort swaps neighbours.") },
      { answer: "Insertion sort", tier: "solid", evidence: ev(2, "Insertion sort grows a sorted prefix.") },
      { answer: "Selection sort", tier: "solid", evidence: ev(2, "Selection sort picks the minimum each pass.") },
      { answer: "Heapsort", aliases: ["heap sort"], tier: "solid", evidence: ev(4, "Heapsort uses a binary heap.") },
      { answer: "Radix sort", tier: "deep", evidence: ev(5, "Radix sort works digit by digit.") },
      { answer: "Counting sort", tier: "deep", evidence: ev(5, "Counting sort tallies keys.") },
      { answer: "Shell sort", aliases: ["shellsort"], tier: "deep", evidence: ev(5, "Shell sort compares far-apart items first.") },
      { answer: "Timsort", aliases: ["tim sort"], tier: "rare", evidence: ev(6, "Timsort is Python's built-in sort.") },
    ],
  },
  {
    kind: "cloze",
    text: "A ____ is a data structure that removes items in last-in, first-out order.",
    answer: "stack",
    tier: "solid",
    hint: "Think of a pile of plates.",
    explanation: "A stack pushes and pops at the same end, so the last item in is the first out.",
    evidence: ev(7, "Stacks are LIFO: push and pop happen at the top."),
  },
  {
    kind: "open",
    text: "Name a programming language created before 1980",
    answers: [
      { answer: "C", tier: "common", evidence: ev(9, "C appeared in 1972 at Bell Labs.") },
      { answer: "Fortran", tier: "common", evidence: ev(9, "Fortran (1957) was built for science.") },
      { answer: "COBOL", tier: "common", evidence: ev(9, "COBOL (1959) ran business systems.") },
      { answer: "Lisp", tier: "solid", evidence: ev(10, "Lisp (1958) introduced garbage collection.") },
      { answer: "BASIC", tier: "solid", evidence: ev(10, "BASIC (1964) was made for students.") },
      { answer: "Pascal", tier: "solid", evidence: ev(10, "Pascal (1970) taught structured programming.") },
      { answer: "Smalltalk", tier: "deep", evidence: ev(11, "Smalltalk (1972) popularised objects.") },
      { answer: "Simula", tier: "deep", evidence: ev(11, "Simula (1967) had the first classes.") },
      { answer: "APL", tier: "rare", evidence: ev(11, "APL (1966) used its own symbols.") },
    ],
  },
  {
    kind: "definition_to_term",
    text: "How an algorithm's running time grows with its input, written like O(n log n)",
    answer: "big o notation",
    aliases: ["big o", "big-o", "time complexity", "asymptotic notation"],
    tier: "deep",
    hint: "It's named after a letter.",
    explanation: "Big O notation gives an upper bound on growth, ignoring constants.",
    evidence: ev(12, "We write the worst case as O(f(n))."),
  },
  {
    kind: "odd_one_out",
    text: "Which one is not a graph algorithm?",
    options: ["Dijkstra", "Kruskal", "Quicksort", "Prim"],
    answer: "Quicksort",
    tier: "solid",
    hint: "Three of them work on edges.",
    explanation: "Dijkstra, Kruskal and Prim work on graphs; Quicksort sorts a list.",
    evidence: ev(14, "Kruskal and Prim both build minimum spanning trees."),
  },
  {
    kind: "open",
    text: "Name a famous computer scientist",
    answers: [
      { answer: "Alan Turing", aliases: ["turing"], tier: "common", evidence: ev(16, "Turing defined computability in 1936.") },
      { answer: "Ada Lovelace", aliases: ["lovelace"], tier: "common", evidence: ev(16, "Lovelace wrote the first published program.") },
      { answer: "Grace Hopper", aliases: ["hopper"], tier: "solid", evidence: ev(17, "Hopper built the first compiler.") },
      { answer: "Donald Knuth", aliases: ["knuth"], tier: "solid", evidence: ev(17, "Knuth wrote The Art of Computer Programming.") },
      { answer: "Edsger Dijkstra", aliases: ["dijkstra"], tier: "solid", evidence: ev(17, "Dijkstra found shortest paths in 1956.") },
      { answer: "Barbara Liskov", aliases: ["liskov"], tier: "deep", evidence: ev(18, "Liskov gave us the substitution principle.") },
      { answer: "Claude Shannon", aliases: ["shannon"], tier: "deep", evidence: ev(18, "Shannon founded information theory.") },
      { answer: "John von Neumann", aliases: ["von neumann"], tier: "deep", evidence: ev(18, "Von Neumann described the stored-program computer.") },
      { answer: "Frances Allen", aliases: ["fran allen"], tier: "rare", evidence: ev(19, "Allen pioneered optimising compilers.") },
    ],
  },
  {
    kind: "ordered_recall",
    text: "Put these languages in order of first release",
    items: ["Fortran", "C", "Python", "Rust"],
    tier: "deep",
    hint: "The oldest is from the 1950s.",
    explanation: "Fortran 1957 → C 1972 → Python 1991 → Rust 2015.",
    evidence: ev(20, "A timeline of languages, 1957–2015."),
  },
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

function matches(guess: string, keys: string[]): boolean {
  const g = normalize(guess);
  return keys.some((k) => {
    const n = normalize(k);
    return n === g || (n.length >= 5 && levenshtein(n, g) <= 1);
  });
}

/** A typed guess against a typed Prompt: the matched Answer and its Tier, or null. */
export function matchGuess(p: FakePrompt, guess: string): { answer: string; tier: Tier } | null {
  if (p.kind === "open") {
    const a = p.answers.find((x) => matches(guess, [x.answer, ...(x.aliases ?? [])]));
    return a ? { answer: a.answer, tier: a.tier } : null;
  }
  if (p.kind === "cloze" || p.kind === "definition_to_term") {
    return matches(guess, [p.answer, ...(p.aliases ?? [])]) ? { answer: p.answer, tier: p.tier } : null;
  }
  return null;
}

/** A few accepted answers per Prompt, for the cheat sheet. */
export function cheatLine(p: FakePrompt): string {
  if (p.kind === "open") return p.answers.map((a) => `${a.answer} (${a.tier})`).join(", ");
  if (p.kind === "ordered_recall") return p.items.join(" → ");
  return p.answer;
}

/** A fixed, bell-ish crowd of scores for the distribution chart. */
export function fakeCrowd(n = 80): number[] {
  let s = 42;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  return Array.from({ length: n }, () => {
    const z = (r() + r() + r() + r() - 2) * 1.7;
    return Math.max(0, Math.min(700, Math.round(250 + z * 110)));
  });
}
