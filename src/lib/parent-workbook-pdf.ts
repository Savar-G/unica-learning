import { isUuid } from "@/lib/workbook-content";

// The PDF download of a shipped workbook (#558, spec #544). One seam, the source:
//   - Supabase (src/lib/parent-workbook-pdf-server.ts): the parent's session, so row-level security gives only the
//     family's shipped workbooks and their files;
//   - in memory, in the tests.
// The link is signed per click and lives a minute, so a page left open never holds a working link to the file.

export const PDF_LINK_SECONDS = 60;

export interface WorkbookPdfSource {
  /** The parent's own shipped workbook, or null when it is not theirs, not shipped or not there. */
  workbook(id: string): Promise<{ number: number; pdfPath: string | null; childName: string } | null>;
  /** A signed link that saves the file under `filename`, or null when signing failed. */
  sign(path: string, seconds: number, filename: string): Promise<string | null>;
}

export type PdfLink = { status: "ok"; url: string } | { status: "not_found" } | { status: "failed" };

/** "Leah-workbook-3.pdf": letters and digits of the name only, so the file name needs no quoting. */
export function pdfFileName(childName: string, number: number): string {
  const name = childName.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, " ").trim().replace(/ +/g, "-");
  return `${name ? `${name}-` : ""}workbook-${number}.pdf`;
}

export async function workbookPdfLink(source: WorkbookPdfSource, id: string): Promise<PdfLink> {
  if (!isUuid(id)) return { status: "not_found" };
  const book = await source.workbook(id);
  if (!book?.pdfPath) return { status: "not_found" };
  const url = await source.sign(book.pdfPath, PDF_LINK_SECONDS, pdfFileName(book.childName, book.number));
  return url ? { status: "ok", url } : { status: "failed" };
}
