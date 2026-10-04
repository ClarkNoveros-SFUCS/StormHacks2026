// Pure helpers for the upload pipeline: no server-only imports, so `node --test` can load them.

export const MAX_PAGES = 100;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const ALLOWED_TYPES = {
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ParsedPage = { pageIndex: number; pageNumber: number; contentMd: string };

/** A short message safe to show the Player. Anything else is logged server-side only. */
export class UserFacingError extends Error {}

/**
 * Checks an upload's name, MIME type and size. Returns the canonical MIME type,
 * or throws a UserFacingError. The extension decides the type: browsers often send
 * an empty or generic MIME type for Office files.
 */
export function validateUpload(filename: string, mimeType: string, sizeBytes: number): string {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (!(ext in ALLOWED_TYPES)) throw new UserFacingError("Only PDF, PPTX and DOCX files are supported");
  const canonical = ALLOWED_TYPES[ext as keyof typeof ALLOWED_TYPES];
  const generic = mimeType === "" || mimeType === "application/octet-stream";
  if (!generic && mimeType !== canonical) {
    throw new UserFacingError("The file's type doesn't match its extension");
  }
  if (sizeBytes === 0) throw new UserFacingError("The file is empty");
  if (sizeBytes > MAX_UPLOAD_BYTES) throw new UserFacingError("Files must be 25 MB or smaller");
  return canonical;
}

/**
 * Numbers the extracted pages (0-based index, 1-based number shown to the Player) and
 * applies the page rules. Blank pages are kept so numbering matches the file.
 */
export function toParsedPages(pages: string[]): ParsedPage[] {
  if (pages.length > MAX_PAGES) throw new UserFacingError(`File has more than ${MAX_PAGES} pages`);
  if (pages.every((p) => p.trim() === "")) {
    throw new UserFacingError(
      "No text could be read from this file. If it's a scanned PDF, export the original slides instead",
    );
  }
  return pages.map((contentMd, pageIndex) => ({ pageIndex, pageNumber: pageIndex + 1, contentMd: contentMd.normalize("NFC") }));
}
