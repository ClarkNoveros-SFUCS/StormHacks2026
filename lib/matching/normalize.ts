// Owned by F05 (#5). This copy follows docs/architecture/answer-matching.md § 1 exactly so
// the F02 seed can write answer_keys; when F05 merges, keep F05's version of this file.

/** The one normalization for Answer keys and guesses. Never re-implement it in SQL. */
export function normalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") //                 "Borůvka" → "Boruvka"
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/&/g, " and ")
    .replace(/'s\b/g, "") //                    "dijkstra's" → "dijkstra"
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, " ") //             "bellman-ford" → "bellman ford"
    .trim();
}
