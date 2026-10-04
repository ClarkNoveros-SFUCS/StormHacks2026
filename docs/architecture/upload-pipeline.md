# Upload pipeline

Turns an uploaded file into stored, per-page text. It runs **once per Source Document**, when the file is added to a Module. Game generation never re-parses; it reads the stored pages from Tiger Data.

## Flow

```
Module page (drop zone)
  │  multipart POST /api/modules/[moduleId]/documents
  │  Route Handler, not a Server Action: Server Actions cap request bodies at 1 MB by default
  ▼
1. Auth: the Clerk user owns the Module (else 404)
2. Validate: extension/MIME ∈ {pdf, pptx, docx}; size ≤ 25 MB (else 400 with a readable message)
3. INSERT source_documents (status = 'uploaded')  → respond 202 { document }
4. after(async () => parseDocument(documentId, bytes))      // next/server; see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md

parseDocument:
  a. status = 'parsing'
  b. write bytes to os.tmpdir()/<documentId>-<filename>
  c. Snowflake:  PUT file://<tmp> @STUDY_DOCS/<playerId>/<documentId>/ AUTO_COMPRESS=FALSE OVERWRITE=TRUE
  d. Snowflake:  SELECT AI_PARSE_DOCUMENT(
                   TO_FILE('@STUDY_DOCS', '<playerId>/<documentId>/<filename>'),
                   {'mode': 'LAYOUT', 'page_split': true}) AS parsed
  e. pages = parsed.pages; if pages.length > 100 → fail('File has more than 100 pages')
  f. one transaction: INSERT source_pages (page_index, page_number = page_index + 1, content_md) for each page;
                      UPDATE source_documents SET status = 'parsed', page_count = n
  g. delete the temp file (in finally)
  on any error: status = 'failed', error = <short user-facing message>; log the full error server-side
```

The Module page re-fetches document status every ~3s while any file is `uploaded` or `parsing`. A `failed` file shows its error and a **Retry** button, which calls `POST /api/documents/[id]/retry`. Retry re-runs `parseDocument` from the copy already on the stage, skipping step c.

### Status values

`uploaded → parsing → parsed`, or `→ failed` from any step. Only `parsed` documents can be selected when creating a Game.

## Snowflake setup (one-time, per environment)

```sql
CREATE STAGE IF NOT EXISTS STUDY_DOCS
  DIRECTORY = (ENABLE = TRUE)
  ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE');
```

Cortex AI functions read internal stages that use server-side encryption. Confirm the current stage requirements in the docs before relying on this: https://docs.snowflake.com/en/sql-reference/functions/ai_parse_document

## `AI_PARSE_DOCUMENT` facts we rely on

- Signature: `AI_PARSE_DOCUMENT(<file_object> [, <options>] [, <return_error_details>])`. The file object comes from `TO_FILE('@stage', 'relative/path')`.
- `'mode': 'LAYOUT'` returns markdown, including tables. The default `'OCR'` returns text only. We use `LAYOUT` because slide structure (headings, bullets) helps Gemini.
- `'page_split': true` works for PDF, PPTX and DOCX only, and returns `{ "pages": [ { "content": "...", "index": 0 }, … ] }`. For PPTX, one page is one slide.
- The Player sees page numbers as `index + 1` everywhere: Evidence, the reveal screen.

## Code layout

| File | Responsibility |
|---|---|
| `app/api/modules/[moduleId]/documents/route.ts` | POST upload (validate, insert, schedule `after`) |
| `app/api/documents/[documentId]/route.ts` | DELETE (with the in-use guard) |
| `app/api/documents/[documentId]/retry/route.ts` | POST retry |
| `lib/snowflake.ts` | Connection helper (`snowflake-sdk`, server only), `putFile`, `parseStagedFile`, `removeStagedFile` |
| `lib/documents/parse-document.ts` | The `parseDocument` steps above |

`snowflake-sdk` needs a real file path for `PUT`, which is why the bytes go to a temp file first. Never import `lib/snowflake.ts` from client components.

## Deleting a Source Document

Deletion is **blocked while any Game uses the file** (a `game_sources` row exists). The API returns 409 and the UI shows "Used by N Games. Delete those Games first."

When the file is free:
1. `REMOVE @STUDY_DOCS/<playerId>/<documentId>/` in Snowflake
2. Delete the `source_documents` row, which cascades to `source_pages`

## Encoding

Store `content_md` exactly as Snowflake returns it, as UTF-8 end to end. The old pipeline produced mojibake ("BorÅ¯vka" for "Borůvka"). If that ever reappears, something is decoding UTF-8 as Latin-1.

## Deployment note

On Vercel, function request bodies are capped at 4.5 MB, which is below our 25 MB limit. If we deploy there, upload from the browser straight to storage first and have the server fetch it from there. When running locally or on a container host, no change is needed. See the open questions in `overview.md`.
