# Rarity is fixed at generation; no crowd-based scoring

Krillion scores an answer by how few *other players* gave it. Our game is solo: each Player's Games come from their own uploaded files, so there's no crowd to measure. We decided that **Rarity is set once when a Game is generated** (Gemini ranks each Open Prompt's Answers from most obvious to most obscure, and code turns that rank into Tiers) **and never changes from play**. The "obvious answers pay less" pressure that a crowd normally provides comes from **Staleness** instead: repeating an Answer you've already scored with pays less each time.

## Considered options

- **Crowd rarity via shared decks** (class codes, or matching uploads by document hash): rejected. Solo is the product, and students rarely upload identical files.
- **Blending an AI prior with crowd counts** (the original `prior_rarity` + `crowd_count` design): rejected along with the crowd.
- **Rarity from document emphasis** (pages mentioned): rejected in favour of a single AI ranking. One signal is simpler, and AIs rank more reliably than they assign calibrated scores.

## Consequences

Don't add `crowd_count`, `players_seen` or any rarity recomputation. If multiplayer is ever added, this ADR needs revisiting.
