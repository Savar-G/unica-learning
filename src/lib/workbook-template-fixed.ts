// The fixed test template (#309): one plain layout for each page type of the sample workbook (cover and practice), so
// the renderer can be built and checked before the workbook DESIGN.md (#305) defines the real templates (#310). It
// follows the landing page's sample sheets: a green day label, a large title, an instruction, then the questions in
// bordered boxes. Every page prints its number and its QR code in the footer; each question box prints its number.
// Its spaces are fixed in size, so content that does not fit overflows and fails the render.
// Pure TypeScript: no Next.js, React, network, database or clock.
import type { OperationKind, QuestionPackage } from "@/lib/question-package";
import { mark, type DraftPage, type PageParts, type WorkbookDraft, type WorkbookTemplate } from "@/lib/workbook-render";

/** Font files to embed (woff2): a sans-serif of weights 300 to 700 and a monospace of 400 to 500. Without them the page
 * uses the system's fonts. */
export interface TemplateFonts {
  sans: Uint8Array;
  mono: Uint8Array;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const fontFace = (family: string, weights: string, woff2: Uint8Array) =>
  `@font-face{font-family:"${family}";font-weight:${weights};src:url(data:font/woff2;base64,${Buffer.from(woff2).toString("base64")}) format("woff2")}`;

const CSS = `
.page{box-sizing:border-box;height:100%;padding:48px 56px 40px;display:flex;flex-direction:column;font-family:"Template Sans",Helvetica,Arial,sans-serif;color:#1d1d1f}
.page>*{flex-shrink:0}
.label{font-family:"Template Mono",ui-monospace,Menlo,monospace;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:#1f7a4d;height:20px;overflow:hidden;white-space:nowrap}
.title{font-size:40px;line-height:52px;font-weight:500;margin:12px 0 0;height:52px;overflow:hidden}
.instruction{font-size:20px;line-height:28px;color:#4a4a4f;margin:8px 0 0;height:28px;overflow:hidden}
.pill{align-self:flex-start;font-family:"Template Mono",ui-monospace,Menlo,monospace;font-size:14px;letter-spacing:.1em;text-transform:uppercase;color:#14532d;background:#e6f4ec;border-radius:999px;padding:6px 16px;margin-top:16px}
.questions{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:320px;gap:24px;margin-top:28px}
.question{position:relative;box-sizing:border-box;border:2px solid #c9c9ce;border-radius:16px;padding:20px 24px;overflow:hidden}
.qnum{font-size:22px;font-weight:600}
.sum{font-family:"Template Mono",ui-monospace,Menlo,monospace;font-size:44px;line-height:60px;width:200px;margin:12px 16px 0 auto;text-align:right;letter-spacing:.08em}
.sum .rule{border-top:3px solid #1d1d1f;margin-top:6px;height:72px}
.sign{float:left}
.text{font-size:28px;line-height:38px;margin:16px 0 0}
.space{height:64px;margin-top:12px}
.footer{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:24px}
.brand{font-size:14px;line-height:20px;color:#6e6e73}
.qr{display:flex;align-items:flex-end;gap:16px}
.qr [data-measure="qr"]{width:84px;height:84px}
.qr svg{width:84px;height:84px;display:block}
.number{font-size:14px;color:#6e6e73;text-align:right}
.number span{display:block;font-size:30px;line-height:38px;font-weight:600;color:#1d1d1f}
.cover{justify-content:flex-start}
.cover .big{font-size:60px;line-height:68px;font-weight:600;margin:260px 0 0;height:136px;overflow:hidden}
.cover .sub{font-size:26px;line-height:34px;color:#4a4a4f;margin:20px 0 0;height:68px;overflow:hidden}
`;

/** "Level U10" or "Levels U10 and U11". */
const levelText = (levels: number[]) => `${levels.length > 1 ? "Levels" : "Level"} ${levels.map((l) => `U${l}`).join(levels.length > 2 ? ", " : " and ")}`;

function footer(page: DraftPage, parts: PageParts, book: WorkbookDraft): string {
  return `<div class="footer"><div class="brand">Unica Learning<br>Workbook ${book.number} · ${levelText(book.levels)}</div>`
    + `<div class="qr"><div class="number">Page<span ${mark.pageNumber}>${page.number}</span></div>${parts.qr}</div></div>`;
}

function cover(page: DraftPage, parts: PageParts, book: WorkbookDraft): string {
  return `<div class="page cover"><div class="label" ${mark.slot("label")}>Workbook ${book.number}</div>`
    + `<h1 class="big" ${mark.slot("title")}>My math workbook</h1>`
    + `<p class="sub" ${mark.slot("subtitle")}>${escape(levelText(book.levels))}</p>`
    + footer(page, parts, book) + `</div>`;
}

/** A practice page's title and instruction, by the kind of its questions; any other page says "Solve". */
const HEADINGS: Partial<Record<OperationKind, { title: string; instruction: string }>> = {
  add: { title: "Adding big numbers", instruction: "Add. Show your work." },
  subtract: { title: "Taking away big numbers", instruction: "Subtract. Show your work." },
};
const MIXED = { title: "Practice", instruction: "Solve. Show your work." };

/**
 * A question's content and answer space: whole-number addition and subtraction in columns, with the rule under them to
 * write on; any other question, or one with no operation, as its text, with a blank space under it.
 */
function body(p: QuestionPackage, n: number): string {
  const op = p.operation;
  if (!op || (op.kind !== "add" && op.kind !== "subtract")) return `<p class="text" ${mark.questionContent(n)}>${escape(p.text)}</p><div class="space" ${mark.answerSpace(n)}></div>`;
  const [a, b] = op.operands;
  return `<div class="sum" ${mark.questionContent(n)}><div>${a}</div><div><span class="sign">${op.kind === "add" ? "+" : "−"}</span>${b}</div>`
    + `<div class="rule" ${mark.answerSpace(n)}></div></div>`;
}

function practice(page: DraftPage, parts: PageParts, book: WorkbookDraft): string {
  const kinds = [...new Set(page.questions.map((q) => q.package.operation?.kind))];
  const { title, instruction } = (kinds.length === 1 && kinds[0] && HEADINGS[kinds[0]]) || MIXED;
  const questions = page.questions.map((q) => `<div class="question" ${mark.question(q.number)}><div class="qnum">${q.number}.</div>${body(q.package, q.number)}</div>`).join("");
  return `<div class="page"><div class="label" ${mark.slot("label")}>${escape(page.dayLabel ?? "")}</div>`
    + `<h1 class="title" ${mark.slot("title")}>${title}</h1>`
    + `<p class="instruction" ${mark.slot("instruction")}>${instruction}</p>`
    + `<div class="pill">Practice</div>`
    + `<div class="questions">${questions}</div>`
    + footer(page, parts, book) + `</div>`;
}

const LAYOUTS: Record<string, (page: DraftPage, parts: PageParts, book: WorkbookDraft) => string> = { cover, practice };

export function fixedTemplate(fonts?: TemplateFonts): WorkbookTemplate {
  return {
    css: (fonts ? fontFace("Template Sans", "300 700", fonts.sans) + fontFace("Template Mono", "400 500", fonts.mono) : "") + CSS,
    page: (page, parts, book) => LAYOUTS[page.type]?.(page, parts, book) ?? null,
  };
}
