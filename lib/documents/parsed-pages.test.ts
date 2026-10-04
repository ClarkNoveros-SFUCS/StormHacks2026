import { test } from "vitest";
import assert from "node:assert/strict";
import { toParsedPages, UserFacingError, validateUpload } from "./parsed-pages.ts";

test("numbers pages: 0-based index, 1-based page number, blanks kept", () => {
  assert.deepEqual(toParsedPages(["# Week 9", "", "Borůvka"]), [
    { pageIndex: 0, pageNumber: 1, contentMd: "# Week 9" },
    { pageIndex: 1, pageNumber: 2, contentMd: "" },
    { pageIndex: 2, pageNumber: 3, contentMd: "Borůvka" },
  ]);
});

test("normalizes to NFC so decomposed accents match typed guesses", () => {
  assert.equal(toParsedPages(["Borůvka"])[0].contentMd, "Borůvka");
});

test("strips control characters (NUL breaks the Postgres insert), keeps newlines and tabs", () => {
  assert.equal(toParsedPages(["median = x\u0000 n+1\u0001\n\ta\r\u007F"])[0].contentMd, "median = x n+1\n\ta");
  assert.throws(() => toParsedPages(["\u0000\u0001"]), /scanned PDF/);
});

test("rejects a file with no text (scanned PDF) and > 100 pages", () => {
  assert.throws(() => toParsedPages([" ", ""]), /scanned PDF/);
  assert.throws(() => toParsedPages(Array(101).fill("x")), /more than 100 pages/);
});

test("validateUpload checks extension, MIME and size", () => {
  assert.equal(validateUpload("a.PDF", "application/pdf", 10), "application/pdf");
  assert.match(validateUpload("s.pptx", "", 10), /presentationml/);
  assert.throws(() => validateUpload("a.txt", "text/plain", 10), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "image/png", 10), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "application/pdf", 0), UserFacingError);
  assert.throws(() => validateUpload("a.pdf", "application/pdf", 25 * 1024 * 1024 + 1), /25 MB/);
});
