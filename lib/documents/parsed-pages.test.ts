import { test } from "node:test";
import assert from "node:assert/strict";
import { stageFilename, toParsedPages, UserFacingError, validateUpload } from "./parsed-pages.ts";

test("parses a page_split JSON string, 0-based index to 1-based page number", () => {
  const raw = JSON.stringify({ pages: [{ content: "# Week 9", index: 0 }, { content: "Borůvka", index: 1 }] });
  assert.deepEqual(toParsedPages(raw), [
    { pageIndex: 0, pageNumber: 1, contentMd: "# Week 9" },
    { pageIndex: 1, pageNumber: 2, contentMd: "Borůvka" },
  ]);
});

test("accepts an object result and sorts by index", () => {
  const pages = toParsedPages({ pages: [{ content: "b", index: 1 }, { content: "a", index: 0 }] });
  assert.deepEqual(pages.map((p) => p.contentMd), ["a", "b"]);
});

test("unwraps return_error_details { value, error }", () => {
  const pages = toParsedPages({ value: JSON.stringify({ pages: [{ content: "x", index: 0 }] }), error: null });
  assert.equal(pages[0].contentMd, "x");
  assert.throws(() => toParsedPages({ value: null, error: "Unsupported file" }), /Unsupported file/);
});

test("keeps empty pages but rejects a file with no text at all", () => {
  const pages = toParsedPages({ pages: [{ content: "x", index: 0 }, { content: "  ", index: 1 }] });
  assert.equal(pages[1].contentMd, "  ");
  assert.throws(() => toParsedPages({ pages: [{ content: " ", index: 0 }] }), UserFacingError);
});

test("rejects NULL, > 100 pages and duplicate indexes", () => {
  assert.throws(() => toParsedPages(null), /NULL/);
  const many = { pages: Array.from({ length: 101 }, (_, i) => ({ content: "x", index: i })) };
  assert.throws(() => toParsedPages(many), /more than 100 pages/);
  assert.throws(() => toParsedPages({ pages: [{ content: "x", index: 0 }, { content: "y", index: 0 }] }), /bad page index/);
});

test("falls back to a single content field", () => {
  assert.deepEqual(toParsedPages({ content: "all" }), [{ pageIndex: 0, pageNumber: 1, contentMd: "all" }]);
});

test("validateUpload checks extension, MIME and size", () => {
  assert.equal(validateUpload("a.PDF", "application/pdf", 10), "application/pdf");
  assert.match(validateUpload("s.pptx", "", 10), /presentationml/);
  assert.throws(() => validateUpload("a.txt", "text/plain", 10), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "image/png", 10), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "application/pdf", 0), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "application/pdf", 25 * 1024 * 1024 + 1), /25 MB/);
});

test("stageFilename keeps only safe characters", () => {
  assert.equal(stageFilename("Week 9: Graphs (final)'.PDF"), "Week_9_Graphs_final_.pdf");
  assert.equal(stageFilename("'; DROP STAGE x;--.docx"), "_DROP_STAGE_x_--.docx");
});
