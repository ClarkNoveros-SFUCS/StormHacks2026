# Parse uploads in Node, not Snowflake

Supersedes the Snowflake part of ADR-0002. **Uploaded files are parsed inside the Next.js server**: PDF with `unpdf` (pdf.js text layer), PPTX by reading the slide XML with `jszip`, DOCX with `mammoth`. Each produces one markdown string per page (per slide for PPTX; per page break or ~3,000-character section for DOCX), stored in `source_pages` exactly as before. The original file isn't kept. Gemini (generation) and Tiger Data (storage) are unchanged.

We first built the Snowflake version (stage + `AI_PARSE_DOCUMENT`). On the first live run the key-pair login and `PUT` worked, but Snowflake refused the parse: `AI function _AI_PARSE_DOCUMENT is not available for trial accounts` (error 399258). Self-service trials keep AI features off until a credit card is added, and we didn't want to require that.

## Considered options

- **Snowflake with a card on file:** rejected for the reason above.
- **Snowflake for storage only, Node for parsing:** rejected. Storage alone doesn't justify a second set of credentials.
- **Gemini reading the PDF:** rejected. No fixed per-page output, and PPTX/DOCX would need converting first.
- **A hosted parser (LlamaParse, Mistral OCR, Azure Document Intelligence):** rejected. Another vendor and API key for a hackathon.

## Consequences

- No credentials or network calls are needed to parse, and parsing takes well under a second for typical lecture files.
- **Scanned PDFs** (no text layer) fail with "No text could be read…". There's no OCR.
- PDF structure is inferred from text positions: larger text → headings, bullet glyphs → list items, wide gaps → ` | ` columns. It's readable but less faithful than a layout model, and math comes out as raw characters.
- **No Retry:** parsing is deterministic and the bytes aren't kept, so a failed file is deleted and uploaded again. `source_documents.stage_path` is unused.
- The MLH Snowflake track no longer applies.
