# #3 F03 Upload pipeline (Snowflake)

Status: in-progress
Branch: pdfparser (the user chose this over feat/3-upload-pipeline)
Updated: 2026-10-03

## Goal
Uploaded PDF/PPTX/DOCX → Snowflake stage → `AI_PARSE_DOCUMENT` (LAYOUT, page_split) → `source_pages` in Tiger Data. Spec: `docs/architecture/upload-pipeline.md`, setup: `docs/setup/snowflake.md`.

## Done so far
- `lib/snowflake.ts`: key-pair (`SNOWFLAKE_JWT`) connection, `withSnowflake` (always destroys the connection), `putFile`, `parseStagedFile`, `removeStagedFile`. 300 s statement timeout. Stage name and paths validated before reaching SQL text.
- `lib/documents/parsed-pages.ts` (pure, unit-tested): `validateUpload`, `stageFilename`, `toParsedPages` (string or object VARIANT, `{value, error}` wrapper from `return_error_details`, `pages[]` or a single `content`, > 100 pages, all-blank file).
- `lib/documents/parse-document.ts`: `parseDocument(id, bytes?)`. It claims the row atomically (`uploaded|failed → parsing`), writes a temp file, PUTs it, parses, then inserts the pages and sets `parsed` in one transaction. On error it sets `failed` with a user-facing message and logs only the error message. The temp dir is removed in `finally`.
- Routes: `GET/POST /api/modules/[moduleId]/documents`, `GET/DELETE /api/documents/[documentId]` (409 + count when a Game uses it), `POST /api/documents/[documentId]/retry` (failed only, from the staged copy).
- `next.config.ts`: `serverExternalPackages: ['snowflake-sdk']`, `experimental.proxyClientMaxBodySize: '26mb'`.
- `npm test` (node:test, no new deps): 8 passing. `tsc`, eslint and `next build` are clean.

## Next steps
1. Fill the Snowflake values in `.env.local` (account, user, role, warehouse, db, schema, stage). Only the private key is set so far, and the file is named `env.local`, which Next doesn't load. Then run the Snowsight check (setup doc step 5).
2. Live test: create a Module row, `POST` a real PDF, a PPTX and a DOCX, and watch the status reach `parsed` with sensible `source_pages`. Try a retry and a delete.
3. Confirm on that first run: (a) the `return_error_details = TRUE` result shape (the code handles both shapes); (b) `PUT` via snowflake-sdk 3.4 with `AUTO_COMPRESS = FALSE` works; (c) the `TO_FILE('@STAGE', ?)` bind form is accepted; (d) UTF-8 survives (e.g. "Borůvka").
4. Tick the F03 checklist in `docs/FEATURES.md` in the PR, after the user approves.

## Decisions & gotchas
- The user's SNOWFLAKE_PIPELINE.md targets another codebase (pdf.js IR, decks, router/cache/budgets). The user said to follow this repo's current design, so only its hardening ideas were taken (return_error_details, result normalization, validated SQL inputs, timeouts, no logging of text or keys).
- Staged name = `stageFilename(filename)` (safe chars only). `source_documents.filename` keeps the original name. `stage_path` = `<playerId>/<documentId>/<safeName>`.
- The staged copy is kept after parsing (Retry needs it). It is removed on DELETE.
- Without `proxyClientMaxBodySize`, proxy.ts silently cuts uploads off at 10 MB.
- Vercel's 4.5 MB body cap is still open (overview.md open questions, F12).
- `tsconfig.json` gained `allowImportingTsExtensions` so tests can import `./x.ts` under `node --test`.

## Files touched
- lib/snowflake.ts, lib/documents/{parsed-pages,parsed-pages.test,parse-document,queries}.ts
- app/api/modules/[moduleId]/documents/route.ts, app/api/documents/[documentId]/route.ts, app/api/documents/[documentId]/retry/route.ts
- next.config.ts, package.json, package-lock.json, tsconfig.json
