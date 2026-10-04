# #3 F03 Upload pipeline

Status: in-progress
Branch: pdfparser (the user chose this over feat/3-upload-pipeline)
Updated: 2026-10-03

## Goal
Uploaded PDF/PPTX/DOCX → per-page markdown in `source_pages`. Spec: `docs/architecture/upload-pipeline.md`. Decision: ADR-0003 (parse in Node).

## Done so far
- First built on Snowflake. The live run showed login and PUT working, but `AI_PARSE_DOCUMENT` is blocked on trial accounts (error 399258) until a card is added. The user chose to go fully Node. Snowflake code, `snowflake-sdk`, the retry route and `docs/setup/snowflake.md` were removed. Posted the contract change on #3.
- `lib/documents/extract/`: `extractPages(bytes, mime)`, with `pdf.ts` (unpdf: lines from positions, size → headings, bullets, ` | ` columns, early >100-page check), `pptx.ts` (deck order via presentation.xml rels, titles, levelled bullets, tables, notes, footers dropped) and `docx.ts` (mammoth HTML → our markdown; split at page breaks, else ~3000-char sections at headings).
- `parsed-pages.ts`: `validateUpload`, `toParsedPages` (NFC, >100 pages, all-blank → scanned-PDF message).
- `parse-document.ts`: atomic claim, extract, one transaction for pages + status, user-facing errors.
- Routes: `GET/POST /api/modules/[moduleId]/documents`, `GET/DELETE /api/documents/[documentId]` (409 when used).
- `npm test`: 11 node:test tests, with fixtures in `lib/documents/extract/fixtures/` (Chrome-rendered PDF, hand-built PPTX/DOCX). tsc, eslint and `next build` are clean.
- `npm run parse:check -- <file> [--full]` for checks without the app.
- Docs: ADR-0003, upload-pipeline.md rewritten, overview/data-model/setup README/.env.example updated, F03 checklist rewritten.

## Next steps
1. Run `npm run parse:check -- <file> --full` on a **real** lecture PDF, PPTX and DOCX (the fixtures are synthetic). Tune `HEADING_RATIO` / `COLUMN_GAP` in `pdf.ts` if headings or columns look wrong.
2. Real upload through the app once F08 is merged (or via fetch in devtools).
3. When the user approves: merge main (F05 added vitest and a `test` script that conflicts with ours; move our tests to vitest or chain both), tick the F03 checklist, set Status done, and open a PR with `Closes #3`.

## Decisions & gotchas
- No Retry: the bytes aren't kept, and parsing is deterministic. F08's Retry button must go (done on feat/8).
- `stage_path` column unused; left in place to avoid a schema change.
- `unpdf`'s `PDFDocumentProxy` has no `destroy()`; use `pdf.loadingTask.destroy()`.
- mammoth drops control characters, so page breaks are marked with the "⟦PAGE⟧" sentinel. Its markdown output escapes punctuation, which is why we go via HTML.
- The extractor files import each other with `.ts` extensions so `node --test` runs them without a build (`allowImportingTsExtensions` is on).

## Files touched
- lib/documents/{parsed-pages,parsed-pages.test,parse-document,queries}.ts, lib/documents/extract/*
- app/api/modules/[moduleId]/documents/route.ts, app/api/documents/[documentId]/route.ts
- scripts/parse-check.ts, next.config.ts, package.json, package-lock.json, tsconfig.json, .env.example
- docs: adr/0003, architecture/{upload-pipeline,overview,data-model}.md, setup/README.md, README.md, FEATURES.md (F03 section)
