# #66 F31 Faster Gemini fallback: fewer retries on 503, fall back on timeout

Status: done
Branch: feat/66-faster-fallback (base `feat/64-split-generation`, PR #65)
Updated: 2026-10-04 08:10

## Goal
Option 3 from the generation-speed analysis (the user chose it after F30; thinking level stays as is). When gemini-3.6-flash is overloaded, reach the fallback sooner, and never let a stalled call fail the Game without trying the fallback.

## Done so far
- Issue #66 created and claimed.
- `lib/gemini.ts`: `withFallback(models, attempt, { sleep })` and `failureKind(err)`. Per-model budget: earlier models `EARLY_RETRY_DELAYS_MS` = [2 s], last model `RETRY_DELAYS_MS` = [2, 5, 12 s]. A timeout moves to the next model at once. `TIMEOUT_MS` 240 → 150 s. `generateDocumentPrompts` uses it (generation and verification).
- `lib/gemini.test.ts` (9 tests). Checked live that the SDK's timeout throws `DOMException` `AbortError` → "timeout".
- Spec § Gemini call (Overload), code layout row; FEATURES F31.

## Next steps
None. PR stacked on #65.

## Decisions & gotchas
- **Found while measuring F30:** a timed-out attempt threw `AbortError`, which the old `retryable()` treated as fatal, so a stalled call failed the Game after 240 s and never tried flash-lite.
- **One quick retry on the first model** (not zero): it catches a momentary 503 without waiting long. This morning's 503s lasted 30+ minutes, so more retries mostly wasted ~20 s per call.
- **150 s timeout:** the slowest normal 3.6-flash call measured was ~120 s (F17 run 2, SQL deck, overgenerate); ±40 s variance between identical calls.
- Network errors (`TypeError: fetch failed`) and 408 are retried like 5xx.
- No hedged requests (starting lite before 3.6 fails): not chosen.

## Files touched
- lib/gemini.ts, lib/gemini.test.ts
- docs/architecture/game-generation-pipeline.md, docs/FEATURES.md (F31 only), this worklog
