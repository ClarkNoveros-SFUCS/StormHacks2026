import { extractDocx } from "./docx.ts";
import { extractPdf, TooManyPagesError } from "./pdf.ts";
import { extractPptx } from "./pptx.ts";
import { ALLOWED_TYPES, MAX_PAGES, UserFacingError } from "../parsed-pages.ts";

// Turns an uploaded file into one markdown string per page, entirely in Node
// (ADR-0003). PDF: one per page. PPTX: one per slide. DOCX: one per page break or section.

export async function extractPages(bytes: Uint8Array, mimeType: string): Promise<string[]> {
  try {
    switch (mimeType) {
      case ALLOWED_TYPES.pdf:
        return await extractPdf(bytes, MAX_PAGES);
      case ALLOWED_TYPES.pptx:
        return await extractPptx(bytes);
      case ALLOWED_TYPES.docx:
        return await extractDocx(bytes);
      default:
        throw new UserFacingError("Only PDF, PPTX and DOCX files are supported");
    }
  } catch (err) {
    if (err instanceof UserFacingError) throw err;
    if (err instanceof TooManyPagesError) throw new UserFacingError(`File has more than ${MAX_PAGES} pages`);
    if (err instanceof Error && err.name === "PasswordException") {
      throw new UserFacingError("This PDF is password-protected. Remove the password and upload it again");
    }
    // Corrupt or not really the type its extension says
    throw new UserFacingError("We couldn't open this file. It may be damaged; try exporting it again", { cause: err });
  }
}
