# PDFs with symbol-font glyphs fail to parse (NUL in page text)

Status: done
Branch: claude/charming-faraday-9di6bj
Updated: 2026-10-04 17:35

## Goal
Some PDFs upload, then fail with "We couldn't read this file" every time. Make them parse.

## Done so far
- Reproduced with two lecture PDFs (a statistics deck, page 37; a C deck, page 36): extraction works, but the text has `\u0000` from symbol-font glyphs, and the `source_pages` insert fails with `invalid byte sequence for encoding "UTF8": 0x00`.
- `toParsedPages` (`lib/documents/parsed-pages.ts`) strips control characters except `\n` and `\t`, before the blank-file check. Unit test added.
- Checked end to end: both PDFs extract and insert into Postgres 16 (56 and 51 pages).

## Next steps
1. None for this fix. Separate, not done: the Module page's status poll replaces the file list and can drop a file uploaded mid-poll (`app/modules/_components/ModuleWorkspace.tsx`, `setDocs(documents…)`); merge instead, and upload files one at a time.

## Decisions & gotchas
- No GitHub issue: the agent's GitHub integration couldn't create one (403). Described in the PR instead.
- Stripping happens in `toParsedPages`, so PPTX and DOCX are covered too.

## Files touched
- lib/documents/parsed-pages.ts, lib/documents/parsed-pages.test.ts, docs/FEATURES.md
