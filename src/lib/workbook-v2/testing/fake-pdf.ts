// Writes the PDF that a typesetter makes when it draws exactly the model, for tests that need no Typst. It has the form of
// the files of the pinned Typst: one white page area, then the inks of the page in order.
import type { Ink, PageModel, Rect } from "../contract";
import { linesOf } from "./fake-typesetter";

const FONTS: readonly { weight: number; name: string }[] = [{ weight: 400, name: "Geist-Regular" }, { weight: 600, name: "Geist-SemiBold" }];
const EM = 1000;

const hex = (code: number) => code.toString(16).padStart(4, "0");
const box = ({ w, h }: Rect) => `0 0 m ${w} 0 l ${w} ${h} l 0 ${h} l\nh`;
const at = (x: number, y: number) => `q 1 0 0 -1 ${x} ${y} cm`;

export const fillOf = (rect: Rect, height: number, grey = 0): string => `/Artifact<</Type/Layout>>BDC\n${at(rect.x, height - rect.y)}/c0 cs ${grey} scn ${box(rect)}\nf\nQ\nEMC`;

/** The drawing commands of one ink. */
export function commandsOf(ink: Ink, height: number): string[] {
  if (ink.kind === "fill") return [fillOf(ink.rect, height)];
  if (ink.kind === "outline") return [`${at(ink.rect.x, height - ink.rect.y)}/c0 CS 0 SCN ${ink.width} w 4 M ${box(ink.rect)}\nS\nQ`];
  return linesOf(ink).map(({ text, start, size, weight, natural }) => {
    const codes = [...text].map((c) => hex(c.charCodeAt(0))).join("");
    const adjust = text.length * EM - (natural.w / size) * EM;
    return `/Span<</MCID 0>>BDC\n${at(start.x, height - start.y)}/c0 cs 0 scn\nBT 0 Tr/f${FONTS.findIndex((f) => f.weight === weight)} ${size} Tf 1 0 0 -1 0 0 Tm[<${codes}>${adjust}]TJ\nET\nQ\nEMC`;
  });
}

export interface FakePage { w: number; h: number; commands: string[]; more?: string }

export const pdfPageOf = (page: PageModel): FakePage =>
  ({ ...page.size, commands: [`/Artifact BMC\nq 1 0 0 -1 0 ${page.size.h} cm/c0 cs 1 scn ${box({ x: 0, y: 0, ...page.size })}\nf\nQ\nEMC`, ...page.regions.flatMap((r) => r.ink.flatMap((ink) => commandsOf(ink, page.size.h)))] });

const CMAP = `1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${Array.from({ length: 4 }, (_, part) => `${64} beginbfchar\n${Array.from({ length: 64 }, (_v, i) => `<${hex(part * 64 + i)}> <${hex(part * 64 + i)}>`).join("\n")}\nendbfchar`).join("\n")}\n5 beginbfchar\n${["2013", "2018", "2019", "201c", "201d"].map((c) => `<${c}> <${c}>`).join("\n")}\nendbfchar`;

export function pdfFile(pages: readonly FakePage[], { colours = 1, catalog = "" } = {}): Uint8Array {
  const stream = (body: string) => `<</Length ${body.length}>>\nstream\n${body}\nendstream`;
  const first = 6 + FONTS.length * 2;
  const objects = [
    `<</Type/Catalog/Pages 2 0 R${catalog}>>`,
    `<</Type/Pages/Count ${pages.length}/Kids[${pages.map((_, i) => `${first + 2 * i} 0 R`).join(" ")}]>>`,
    `<</ProcSet[/PDF/Text]/ColorSpace<</c0 4 0 R>>/Font<<${FONTS.map((_, i) => `/f${i} ${6 + 2 * i} 0 R`).join("")}>>>>`,
    "[/ICCBased 5 0 R]",
    stream("").replace("<<", `<</N ${colours}`),
    ...FONTS.flatMap(({ name }, i) => [
      `<</Type/Font/Subtype/Type0/BaseFont/ABCDEF+${name}/Encoding/Identity-H/DescendantFonts[<</Type/Font/DW 0/W[0 65535 ${EM}]>>]/ToUnicode ${7 + 2 * i} 0 R>>`,
      stream(CMAP),
    ]),
    ...pages.flatMap(({ w, h, commands, more = "" }, i) => [`<</Type/Page/Resources 3 0 R/MediaBox[0 0 ${w} ${h}]/Parent 2 0 R/Contents ${first + 2 * i + 1} 0 R${more}>>`, stream(commands.join("\n"))]),
  ];
  let file = "%PDF-1.7\n";
  const offsets = objects.map((body, i) => {
    const offset = file.length;
    file += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f\r\n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n\r\n`).join("")}`;
  return Buffer.from(`${file}${table}trailer\n<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${file.length}\n%%EOF`, "latin1");
}

export const pagesPdf = (pages: readonly PageModel[]): Uint8Array => pdfFile(pages.map(pdfPageOf));
