// What a typesetter must give for a book, before its content is checked. A renderer is code from outside the pure engine,
// so a part that it does not give must be a problem of the book and not a hole in it.
import type { PageModel } from "../contract";
import type { Rendering } from "../renderer";

const PDF = [..."%PDF-"].map((c) => c.charCodeAt(0));

const isBytes = (value: unknown): value is Uint8Array => value instanceof Uint8Array && value.length > 0;
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const hasSheet = (list: unknown, sheet: number) => listOf(list).some((entry) => typeof entry === "object" && entry !== null && "sheet" in entry && entry.sheet === sheet);

export function checkRendering(pages: readonly PageModel[], drawn: Rendering): string[] {
  const problems: string[] = [];
  const tell = (what: string) => problems.push(`The typesetter ${what}.`);
  if (!isBytes(drawn.pdf) || PDF.some((byte, i) => drawn.pdf[i] !== byte)) tell("gave no PDF");
  const images = listOf(drawn.images);
  if (images.length !== pages.length) tell(`must give one image for each of the ${pages.length} pages, and it gave ${images.length}`);
  pages.forEach((page, i) => {
    if (!isBytes(images[i])) tell(`gave no image of page ${page.page}`);
    if (!hasSheet(drawn.positions, i + 1)) tell(`gave no positions of page ${page.page}`);
    if (!hasSheet(drawn.texts, i + 1)) tell(`gave no texts of page ${page.page}`);
  });
  return problems;
}
