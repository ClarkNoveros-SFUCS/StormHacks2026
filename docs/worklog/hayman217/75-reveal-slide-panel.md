# #75 Slide panel on the Reveal + tidy study notes from parsed slides

Status: in-review
Branch: feat/75-reveal-slide-panel
Updated: 2026-10-04 10:05

## Goal
On the Reveal, an Evidence link (`Week2.pdf · p.12`) opens that page in a side panel instead of
leaving the page. Parsed slide text shows as tidy study notes (headings, lists, tables, bold terms,
readable formulas), with the raw parsed text one toggle away. Issue #75.

## Done so far
- `db/migrations/20261004T1300_page_notes.sql`: nullable `source_pages.notes_md` (applied to the shared DB).
- `lib/gemini/notes.ts`: one Gemini call per page, reformat only. Fast model first
  (GEMINI_FALLBACK_MODEL, flash-lite, ~1 s), then GEMINI_MODEL. 3.6-flash took 26 s and 503'd in testing.
- `GET /api/documents/[documentId]/pages/[pageNumber]/notes`: owner only, writes notes on first
  request, caches in `notes_md`, dedupes concurrent requests in-process; 502 if Gemini fails.
- `components/results/SlidePanel.tsx`: provider + right drawer (study notes,
  ←/→ pages, Esc, quote callout on the Evidence page, "Open in Module →"). Dims the page below `lg` only.
- `EvidenceLine` opens the panel when inside the provider and the link goes to `/modules/…`
  (course Topic links and modified clicks still navigate). `RevealScreen` wraps every Mode in the provider.
- `MarkdownView` `variant="notes"`: formulas in the body font (the pixel code font has no math glyphs).
- Markdown tables: pipes inside `code` spans no longer split cells (`P(A|B)`).
- Review round 1 (user): removed the "Original text" toggle everywhere (notes only; the parsed text
  shows only if Gemini fails), removed the file ↔ Game hover glow on the Module page, and banned
  LaTeX-style `lim_{n→∞}` in the notes prompt.
- Review round 2 (user): "View text" opens a real study page instead of a pop-up.
  `/modules/[moduleId]/study/[documentId]?page=N` (`StudyNotes.tsx`): the whole file as continuous
  notes, sticky contents with scroll spy and progress (page picker on phones), ←/→ between pages,
  notes loaded lazily as pages near the screen (3 at a time), "Test yourself" links to the Games
  built from the file. The FileViewer modal is deleted; old `?doc=&page=` and `/modules/files/<id>`
  links redirect to the study page; Evidence links and the slide panel's footer point there too.
- Verified in the browser (dev server on :3100 with DEV_PLAYER_ID) on the Week2 deck.

## Next steps
1. User review. After approval: PR with `Closes #75`, add a FEATURES.md row, set this worklog to done.

## Decisions & gotchas
- `content_md` is untouched: generation and Evidence quotes still use the raw text.
- Notes regenerate automatically after a re-parse (pages are deleted and re-inserted).
- To refresh notes after a prompt change: `update source_pages set notes_md = null`.
- `lib/daily/daily.test.ts` fails locally only when `.env.local` sets NEXT_PUBLIC_SITE_URL (unrelated).

## Files touched
- db/migrations/20261004T1300_page_notes.sql
- lib/gemini/notes.ts, lib/gemini/notes.test.ts
- app/api/documents/[documentId]/pages/[pageNumber]/notes/route.ts
- components/results/SlidePanel.tsx, components/results/EvidenceLine.tsx
- app/runs/[runId]/mode-screens.tsx
- app/modules/_lib/notes.ts, app/modules/_lib/markdown.ts (+ test)
- app/modules/_components/MarkdownView.tsx, StudyNotes.tsx (new), FileViewer.tsx (deleted)
- app/modules/[moduleId]/study/[documentId]/page.tsx, app/modules/[moduleId]/page.tsx, app/modules/files/[documentId]/page.tsx
- app/modules/_components/ModuleWorkspace.tsx, FilesPanel.tsx, GamesPanel.tsx; components/modes/shared/reveal-links.ts
