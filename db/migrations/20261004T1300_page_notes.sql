-- #75: tidy study notes for a parsed page (headings, lists, tables), written by Gemini the first
-- time someone views the page. NULL until then. content_md stays the source for generation and Evidence.
ALTER TABLE source_pages ADD COLUMN notes_md text;
