import { describe, expect, it } from "vitest";
import { PDF_LINK_SECONDS, pdfFileName, workbookPdfLink, type WorkbookPdfSource } from "@/lib/parent-workbook-pdf";

// The PDF download of a shipped workbook (#558), through its one function, over an in-memory source that keeps the
// database's rule: a parent reads only their own shipped workbooks.

const OWN = "44444444-4444-4444-8444-444444444444";
const NO_PDF = "55555555-5555-4555-8555-555555555555";

function source(): WorkbookPdfSource & { signed: { path: string; seconds: number; filename: string }[] } {
  const signed: { path: string; seconds: number; filename: string }[] = [];
  const books: Record<string, { number: number; pdfPath: string | null; childName: string }> = {
    [OWN]: { number: 3, pdfPath: `parent-1/${OWN}/workbook.pdf`, childName: "Leah" },
    [NO_PDF]: { number: 1, pdfPath: null, childName: "Leah" },
  };
  return {
    signed,
    async workbook(id) {
      return books[id] ?? null;
    },
    async sign(path, seconds, filename) {
      signed.push({ path, seconds, filename });
      return `https://storage.example/${path}?token=t&download=${filename}`;
    },
  };
}

describe("the workbook PDF link", () => {
  it("signs the parent's own shipped book for a short time, as a download named for the child", async () => {
    const s = source();
    expect(await workbookPdfLink(s, OWN)).toEqual({ status: "ok", url: `https://storage.example/parent-1/${OWN}/workbook.pdf?token=t&download=Leah-workbook-3.pdf` });
    expect(s.signed).toEqual([{ path: `parent-1/${OWN}/workbook.pdf`, seconds: PDF_LINK_SECONDS, filename: "Leah-workbook-3.pdf" }]);
    expect(PDF_LINK_SECONDS).toBeLessThanOrEqual(120);
  });
  it("is not found for a book the parent may not read, one with no PDF, and an id that is not a uuid", async () => {
    const s = source();
    expect(await workbookPdfLink(s, "66666666-6666-4666-8666-666666666666")).toEqual({ status: "not_found" });
    expect(await workbookPdfLink(s, NO_PDF)).toEqual({ status: "not_found" });
    expect(await workbookPdfLink(s, "../etc/passwd")).toEqual({ status: "not_found" });
    expect(s.signed).toEqual([]);
  });
  it("fails, and gives no link, when signing fails", async () => {
    const s = { ...source(), sign: async () => null };
    expect(await workbookPdfLink(s, OWN)).toEqual({ status: "failed" });
  });
  it("names the file with safe characters only", () => {
    expect(pdfFileName("Leah", 3)).toBe("Leah-workbook-3.pdf");
    expect(pdfFileName("Zoë Ann", 2)).toBe("Zoe-Ann-workbook-2.pdf");
    expect(pdfFileName("\"; rm -rf /", 1)).toBe("rm-rf-workbook-1.pdf");
    expect(pdfFileName("李", 4)).toBe("workbook-4.pdf");
  });
});
