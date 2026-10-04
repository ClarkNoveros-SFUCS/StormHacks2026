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
 * The name the file gets on the Snowflake stage. PUT takes the local file's name and
 * can't use bind variables, so only plain characters may reach the SQL text.
 */
export function stageFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = filename.slice(0, dot).replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 80) || "file";
  const ext = filename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${base}.${ext}`;
}

/**
 * Turns the value AI_PARSE_DOCUMENT returns into ordered pages.
 * Handles: a JSON string or an object (the driver returns VARIANT either way), the
 * `return_error_details` wrapper `{ value, error }`, and the `{ pages: [{ content, index }] }`
 * shape from `page_split`. `index` is the 0-based page in the file; the Player sees index + 1.
 */
export function toParsedPages(raw: unknown): ParsedPage[] {
  if (raw == null) throw new Error("AI_PARSE_DOCUMENT returned NULL");
  let result = typeof raw === "string" ? JSON.parse(raw) : raw;

  if (isObject(result) && ("error" in result || "value" in result) && !("pages" in result)) {
    if (result.error) throw new Error(`AI_PARSE_DOCUMENT error: ${String(result.error)}`);
    result = typeof result.value === "string" ? JSON.parse(result.value) : result.value;
  }
  if (!isObject(result)) throw new Error("AI_PARSE_DOCUMENT returned an unexpected shape");

  let pages: { content: unknown; index: unknown }[];
  if (Array.isArray(result.pages)) pages = result.pages;
  else if (typeof result.content === "string") pages = [{ content: result.content, index: 0 }];
  else throw new Error("AI_PARSE_DOCUMENT result has no pages");

  if (pages.length === 0) throw new UserFacingError("No pages could be read from this file");
  if (pages.length > MAX_PAGES) throw new UserFacingError(`File has more than ${MAX_PAGES} pages`);

  const seen = new Set<number>();
  const out = pages.map((p, i) => {
    const pageIndex = typeof p.index === "number" ? p.index : i;
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || seen.has(pageIndex)) {
      throw new Error(`AI_PARSE_DOCUMENT returned a bad page index at position ${i}`);
    }
    seen.add(pageIndex);
    return { pageIndex, pageNumber: pageIndex + 1, contentMd: typeof p.content === "string" ? p.content : "" };
  });
  out.sort((a, b) => a.pageIndex - b.pageIndex);

  if (out.every((p) => p.contentMd.trim() === "")) {
    throw new UserFacingError("No text could be read from this file");
  }
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
