// The single normalizer for typed Answers. Used when storing answer_keys at
// generation time (F04) and when matching guesses (match-guess.ts). Never
// re-implement it in SQL. Spec: docs/architecture/answer-matching.md §1.
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") //               1. strip combining marks: "Borůvka" → "Boruvka"
    .toLowerCase() //                        2.
    .replace(/[‘’‚‛]/g, "'") //              3. curly quotes → straight
    .replace(/[“”„‟]/g, '"')
    .replace(/&/g, " and ")
    .replace(/'s\b/g, "") //                 4. trailing possessive: "dijkstra's" → "dijkstra"
    .replace(/'/g, "") //                    5. remaining apostrophes
    .replace(/[^a-z0-9]+/g, " ") //          6 + 7. everything else → one space
    .trim();
}
