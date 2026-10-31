// The workbook renderer (#309, spec #296): a workbook's content and a template in; the print PDF, one image per page,
// each question's box on its page image and each page's QR link out, ready for the workbook store (#299). The
// template writes each page as HTML and marks what the renderer measures (see `mark`); a print engine (headless
// Chromium, src/lib/print-engine-chromium.ts, or the fake for tests, src/lib/print-engine-fake.ts) lays the pages out,
// prints the PDF, takes one image per page, measures every marked element and reads each page's QR code back from its
// image. From those it takes each question's box and checks the page: its number printed, every question on it with its
// content (text and numbers) printed and an answer space, its QR code visible and reading as the page's link, and
// nothing overflowing its space. "Printed" means each piece of text shows and leaves ink on the page image, not only
// that its outer box shows.
// A page that fails a check fails the render, with the page and question named; nothing is clipped silently.
//
// Pages are US Letter. Page numbers run through the whole workbook; question numbers restart on each page (the
// template prints both); the QR code holds the page's desk link, https://unicalearning.com/tutor/p/<token> (#301).
// Pure TypeScript: no Next.js, React, network, database or clock.
import QRCode from "qrcode";
import type {
  PageInput,
  QuestionBox,
  QuestionInput,
  Workbook,
  WorkbookFile,
  WorkbookFiles,
  WorkbookInput,
  WorkbookRendering,
  WorkbookStore,
  WorkbookWrite,
} from "@/lib/workbook-content";
import type { PageContent } from "@/lib/workbook-page";

// ---------- Content in ----------

/** A question to render: its number on the page and its package; the renderer measures its box. */
export type DraftQuestion = Omit<QuestionInput, "box">;

/**
 * A page to render: the renderer makes its image. `content` is what the page's named slots hold (titles, worked
 * examples, which questions sit in which slot; src/lib/workbook-page.ts): the template lays it out; it is not stored.
 */
export interface DraftPage extends Omit<PageInput, "image" | "questions"> {
  questions: DraftQuestion[];
  content?: PageContent;
}

/** A workbook to render: its content, with no files or boxes yet. */
export interface WorkbookDraft extends Omit<WorkbookInput, "pdfPath" | "pages"> {
  pages: DraftPage[];
}

// ---------- Templates ----------

/**
 * The `data-measure` attribute of each element the renderer measures. A template marks the page number (the element's
 * text is the number alone), each question (its box on the page image), inside each question its content (the text and
 * numbers the child reads, all of which must print) and its answer space (where the child writes, at least half an inch
 * each way; it may lie inside the content), and each slot with a size limit. The QR code comes marked from the renderer (PageParts.qr).
 */
export const mark = {
  pageNumber: `data-measure="page-number"`,
  question: (n: number) => `data-measure="question-${n}"`,
  questionContent: (n: number) => `data-measure="question-${n}-content"`,
  answerSpace: (n: number) => `data-measure="question-${n}-answer"`,
  /** A named space with a size limit: "title", "instruction". Its content must fit it. */
  slot: (name: string) => `data-measure="slot-${name}"`,
} as const;

export interface PageParts {
  /**
   * The page's QR code, made and marked by the renderer: an element holding an SVG, to place as it is and size with the
   * template's CSS (at least 0.6 inches).
   */
  qr: string;
  /** The link in the QR code. */
  qrUrl: string;
}

/** A page that does not fit its template: the slot and the question when it is one of them, and why. */
export interface FitProblem {
  question: number | null;
  slot: string | null;
  reason: string;
}

export interface WorkbookTemplate {
  /** The template's style sheet. The renderer sets the page size and the page frame. */
  css: string;
  /** One page's HTML, inside its frame, or null when the template has no layout for the page's type. */
  page(page: DraftPage, parts: PageParts, book: WorkbookDraft): string | null;
  /**
   * The template's own fit check of a laid-out page, after the renderer's: its marked elements by name (this page's
   * only). Content that overflows a slot, a slot holding more than it takes, or a writing space smaller than the design
   * allows is a problem; the renderer fails the render with it. Never shrink content to pass.
   */
  fit?(page: DraftPage, measured: ReadonlyMap<string, MeasuredElement>, book: WorkbookDraft): FitProblem[];
  /** The smallest answer space each way in CSS pixels; half an inch when not given. */
  answerMin?: number;
}

// ---------- The print engine seam ----------

/** The page size in CSS pixels (96 per inch): US Letter. */
export const PRINT_PAGE = { width: 816, height: 1056 } as const;
/** Image pixels per CSS pixel: page images are 150 dots per inch. */
export const IMAGE_SCALE = 150 / 96;

export interface PrintJob {
  /** A whole document: one `[data-sheet]` element per page, each exactly one printed page. */
  html: string;
  sheets: number;
  page: { width: number; height: number };
  scale: number;
}

/** A marked element as laid out: its rect in CSS pixels from its sheet's top left corner, and its sizes. */
export interface MeasuredElement {
  /** Its sheet, from 0 in document order. */
  sheet: number;
  /** The `data-measure` value. */
  name: string;
  /** Its text, trimmed. */
  text: string;
  /** Whether it shows: laid out, not hidden by CSS (display, visibility, content-visibility or opacity 0). */
  visible: boolean;
  /**
   * Whether its text prints: it has text, and every line of it shows by CSS, is big enough, is not clipped and leaves its
   * own ink on the page image, so text hidden inside a visible element does not pass (see the Chromium engine). False
   * for an element with no text; the renderer reads it for the page number and each question's content.
   */
  textPrinted: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
}

export interface PrintOutput {
  pdf: Uint8Array;
  /** The PDF's page count. */
  pdfPages: number;
  /** One PNG per sheet, in order, with the text of the QR code read back from it (null when none reads). */
  images: { png: Uint8Array; width: number; height: number; qrText: string | null }[];
  /** Every `[data-measure]` element; each sheet itself is measured with the name "sheet". */
  measured: MeasuredElement[];
}

export interface PrintEngine {
  print(job: PrintJob): Promise<PrintOutput>;
}

// ---------- Result ----------

/** Why a page failed: the page and, when it is one question, the question; the slot when the template names one. */
export interface RenderProblem {
  page: number;
  question: number | null;
  slot?: string;
  reason: string;
}

export type RenderResult =
  | {
    status: "rendered";
    /** The workbook to store, with the PDF, the page images and each question's measured box. */
    workbook: WorkbookInput;
    /** The PDF first, then one image per page; store them before the workbook. */
    files: WorkbookFile[];
    pages: { number: number; qrUrl: string }[];
  }
  | { status: "failed"; problems: RenderProblem[] };

/** The desk link a page's QR code holds (#301). */
export const pageUrl = (token: string) => `https://unicalearning.com/tutor/p/${token}`;

/** File names in the workbook's folder; a file key makes them new for each render, so a new render never meets old files. */
const pdfName = (key?: string) => (key ? `workbook-${key}.pdf` : "workbook.pdf");
const pageImageName = (n: number, key?: string) => (key ? `page-${n}-${key}.png` : `page-${n}.png`);

/** A link as a QR code: an SVG of black modules on white, with the four-module quiet zone. */
export function qrSvg(url: string): string {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = modules.size + 8;
  let path = "";
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) if (modules.get(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/**
 * The page's QR code as the renderer marks it; the engine reads it back from the page image. data-qr-link names the
 * link drawn, for a reader of the document (the fake engine); it prints nothing.
 */
const qrElement = (url: string) => `<div data-measure="qr" data-qr-link="${url}">${qrSvg(url)}</div>`;

/** The whole document: the renderer's page frame, the template's style sheet, then one sheet per page. */
function documentHtml(css: string, sheets: string[]): string {
  const frame = `@page{size:8.5in 11in;margin:0}html,body{margin:0;padding:0;background:#fff}`
    + `[data-sheet]{position:relative;box-sizing:border-box;background:#fff;width:${PRINT_PAGE.width}px;height:${PRINT_PAGE.height}px;overflow:hidden;break-after:page}`;
  const body = sheets.map((s, i) => `<section data-sheet="${i}" data-measure="sheet">${s}</section>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${frame}</style><style>${css}</style></head><body>${body}</body></html>`;
}

/** The smallest QR code a phone camera reads well from a page: 0.6 inches. */
const QR_MIN = 0.6 * 96;

/** Whether an element's content is larger than its box: it would be clipped or spill out. */
const overflows = (m: MeasuredElement | undefined) => !!m && (m.scrollHeight > m.clientHeight + 1 || m.scrollWidth > m.clientWidth + 1);

/** The smallest answer space: half an inch each way. */
const ANSWER_MIN = 0.5 * 96;

/** Whether a rect lies inside another, allowing for sub-pixel layout. */
const within = (m: MeasuredElement, box: MeasuredElement) =>
  m.x >= box.x - 0.5 && m.y >= box.y - 0.5 && m.x + m.width <= box.x + box.width + 0.5 && m.y + m.height <= box.y + box.height + 0.5;

/** Whether a rect lies on its page, allowing for sub-pixel layout. */
const insidePage = (m: MeasuredElement) =>
  m.width > 0 && m.height > 0 && m.x >= -0.5 && m.y >= -0.5 && m.x + m.width <= PRINT_PAGE.width + 0.5 && m.y + m.height <= PRINT_PAGE.height + 0.5;

/** A rect in CSS pixels as whole pixels of its page image: the smallest box that covers it, kept inside the image. */
function pixelBox(m: MeasuredElement, image: { width: number; height: number }): QuestionBox {
  const sx = image.width / PRINT_PAGE.width;
  const sy = image.height / PRINT_PAGE.height;
  const x = Math.max(0, Math.floor(m.x * sx));
  const y = Math.max(0, Math.floor(m.y * sy));
  return { x, y, width: Math.min(Math.ceil((m.x + m.width) * sx), image.width) - x, height: Math.min(Math.ceil((m.y + m.height) * sy), image.height) - y };
}

/**
 * Renders a workbook. `fileKey` (letters, digits, - and _), when given, goes into every file name ("page-2-<key>.png"),
 * so each render's files are new: pass a random one for each render that is stored.
 */
export async function renderWorkbook(o: {
  draft: WorkbookDraft; parentId: string; template: WorkbookTemplate; engine: PrintEngine; fileKey?: string;
}): Promise<RenderResult> {
  const { draft, template } = o;
  const answerMin = template.answerMin ?? ANSWER_MIN;
  const problems: RenderProblem[] = [];
  const sheets: string[] = [];
  for (const page of draft.pages) {
    const qrUrl = pageUrl(page.qrToken);
    const html = template.page(page, { qr: qrElement(qrUrl), qrUrl }, draft);
    if (html === null) problems.push({ page: page.number, question: null, reason: `the template has no layout for a ${page.type} page` });
    sheets.push(html ?? "");
  }
  if (problems.length) return { status: "failed", problems };

  const out = await o.engine.print({ html: documentHtml(template.css, sheets), sheets: sheets.length, page: PRINT_PAGE, scale: IMAGE_SCALE });
  if (out.images.length !== draft.pages.length) throw new Error(`print engine: ${out.images.length} images for ${draft.pages.length} pages`);
  if (out.pdfPages !== draft.pages.length) throw new Error(`print engine: the PDF has ${out.pdfPages} pages for ${draft.pages.length}`);

  const folder = `${o.parentId}/${draft.id}`;
  const pdfPath = `${folder}/${pdfName(o.fileKey)}`;
  const files: WorkbookFile[] = [{ path: pdfPath, contentType: "application/pdf", bytes: out.pdf }];
  const pages: PageInput[] = [];
  draft.pages.forEach((page, i) => {
    const image = out.images[i];
    const path = `${folder}/${pageImageName(page.number, o.fileKey)}`;
    files.push({ path, contentType: "image/png", bytes: image.png });
    const fail = (question: number | null, reason: string, slot?: string) => problems.push({ page: page.number, question, ...(slot ? { slot } : {}), reason });
    const measured = new Map<string, MeasuredElement>();
    for (const m of out.measured.filter((m) => m.sheet === i)) {
      if (measured.has(m.name)) fail(null, `the template marks ${m.name} more than once`);
      measured.set(m.name, m);
    }
    if (overflows(measured.get("sheet"))) fail(null, "the content does not fit the page");
    for (const m of measured.values()) {
      if (m.name.startsWith("slot-") && overflows(m)) fail(null, `the ${m.name.slice(5)} does not fit its space`, m.name.slice(5));
    }
    const number = measured.get("page-number");
    if (number?.text !== String(page.number) || !number.visible || !number.textPrinted || !insidePage(number)) fail(null, "the page number is not printed");
    const qr = measured.get("qr");
    if (!qr?.visible) fail(null, "the QR code is not printed");
    else if (qr.width < QR_MIN || qr.height < QR_MIN || !insidePage(qr)) fail(null, "the QR code is smaller than 0.6 inches or not inside the page");
    else if (image.qrText !== pageUrl(page.qrToken)) fail(null, "the QR code does not read as the page's link");
    const questions: QuestionInput[] = [];
    for (const q of page.questions) {
      const m = measured.get(`question-${q.number}`);
      const content = measured.get(`question-${q.number}-content`);
      const answer = measured.get(`question-${q.number}-answer`);
      if (!m) fail(q.number, `question ${q.number} is not on the page`);
      else if (!insidePage(m)) fail(q.number, `question ${q.number} is not inside the page`);
      else if (!m.visible) fail(q.number, `question ${q.number} is hidden`);
      else if (overflows(m)) fail(q.number, `question ${q.number} does not fit its space`);
      else if (!content?.visible || !content.textPrinted || !within(content, m)) fail(q.number, `question ${q.number}'s content is not printed`);
      else if (!answer?.visible || !within(answer, m) || answer.width < answerMin || answer.height < answerMin) {
        fail(q.number, `question ${q.number} has no answer space`);
      } else questions.push({ ...q, box: pixelBox(m, image) });
    }
    for (const p of template.fit?.(page, measured, draft) ?? []) fail(p.question, p.reason, p.slot ?? undefined);
    pages.push({ number: page.number, dayLabel: page.dayLabel, type: page.type, qrToken: page.qrToken, image: { path, width: image.width, height: image.height }, questions });
  });
  if (problems.length) return { status: "failed", problems };

  const { id, childId, number, levels, profileBuild } = draft;
  return {
    status: "rendered",
    workbook: { id, childId, number, levels, profileBuild, pdfPath, pages },
    files,
    pages: draft.pages.map((p) => ({ number: p.number, qrUrl: pageUrl(p.qrToken) })),
  };
}

/** A page's sheet with its failures drawn on it: a red banner with each reason and the named questions outlined. */
function proofSheet(template: WorkbookTemplate, draft: WorkbookDraft, page: DraftPage, sheet: number, mine: RenderProblem[]): string {
  const qrUrl = pageUrl(page.qrToken);
  const html = template.page(page, { qr: qrElement(qrUrl), qrUrl }, draft) ?? "";
  if (mine.length === 0) return html;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const outlined = [...new Set(mine.flatMap((x) => (x.question ? [`[data-measure="question-${x.question}"]`] : [])))];
  const style = outlined.length ? `<style>[data-sheet="${sheet}"] :is(${outlined.join(",")}){outline:3px solid #E5484D!important;outline-offset:2px}</style>` : "";
  const banner = `<div style="position:absolute;left:0;right:0;top:0;z-index:99;background:#B42318;color:#fff;font:600 13px/1.4 Helvetica,Arial,sans-serif;padding:8px 14px">`
    + `RENDER FAILED · page ${page.number}<br>${mine.map((x) => `${x.slot ? `[${esc(x.slot)}] ` : ""}${esc(x.reason)}`).join("<br>")}</div>`;
  return html + style + banner;
}

/** The proof CSS: the content area's bottom edge as a dashed line, with what ran past it left visible. */
const PROOF_CSS = `[data-measure="slot-content"]{overflow:visible!important;position:relative}`
  + `[data-measure="slot-content"]::after{content:"";position:absolute;left:-12px;right:-12px;top:100%;border-top:3px dashed #E5484D}`;

/**
 * The failing pages of a render, printed again with their failure shown on them: a red banner with each reason, the
 * named questions and slots outlined, and the content area's bottom edge as a dashed line with what ran past it left
 * visible. For a reviewer to see a failure; never stored or printed.
 */
export async function proofPages(o: {
  draft: WorkbookDraft; template: WorkbookTemplate; engine: PrintEngine; problems: RenderProblem[];
}): Promise<{ page: number; png: Uint8Array }[]> {
  const failing = o.draft.pages.filter((p) => o.problems.some((x) => x.page === p.number));
  if (failing.length === 0) return [];
  const sheets = failing.map((page, i) => proofSheet(o.template, o.draft, page, i, o.problems.filter((x) => x.page === page.number)));
  const out = await o.engine.print({ html: documentHtml(o.template.css + PROOF_CSS, sheets), sheets: sheets.length, page: PRINT_PAGE, scale: IMAGE_SCALE });
  return failing.map((page, i) => ({ page: page.number, png: out.images[i].png }));
}

/**
 * The whole book printed for a reviewer (#363), whatever its checks say: every page as the template lays it out, a page
 * the template has no layout for as an empty sheet, and each page in `problems` with its failure drawn on it (as in
 * proofPages). For review only: never stored as the print file.
 */
export async function reviewPrint(o: {
  draft: WorkbookDraft; template: WorkbookTemplate; engine: PrintEngine; problems: RenderProblem[];
}): Promise<{ pdf: Uint8Array; images: Uint8Array[] }> {
  const sheets = o.draft.pages.map((page, i) => proofSheet(o.template, o.draft, page, i, o.problems.filter((x) => x.page === page.number)));
  // The proof lines only on the failing sheets.
  const failing = o.draft.pages.flatMap((p, i) => (o.problems.some((x) => x.page === p.number) ? [i] : []));
  const css = o.template.css + failing.map((i) => PROOF_CSS.replace(/\[data-measure="slot-content"\]/g, `[data-sheet="${i}"] [data-measure="slot-content"]`)).join("");
  const out = await o.engine.print({ html: documentHtml(css, sheets), sheets: sheets.length, page: PRINT_PAGE, scale: IMAGE_SCALE });
  return { pdf: out.pdf, images: out.images.map((x) => x.png) };
}

/**
 * Stores every file; when an upload fails, removes them all, the failed one too (its answer may be lost after Storage
 * kept it), and throws.
 */
async function putAll(files: WorkbookFile[], store: WorkbookFiles): Promise<void> {
  const tried: string[] = [];
  try {
    for (const file of files) {
      tried.push(file.path);
      await store.put(file);
    }
  } catch (e) {
    await store.remove(tried);
    throw e;
  }
}

/**
 * Stores a rendered workbook: every file in the workbook bucket, then the workbook through the store. When an upload
 * fails or the store refuses the workbook, it removes the files it stored, so no file is left that no workbook names.
 * When the write's answer is unknown (it throws, as on a lost response), the workbook may be stored, so the files stay:
 * read the workbook to know. Files no workbook names stay in the family's folder and go with the family.
 */
export async function saveRenderedWorkbook(
  rendered: Extract<RenderResult, { status: "rendered" }>, o: { files: WorkbookFiles; store: WorkbookStore },
): Promise<WorkbookWrite> {
  await putAll(rendered.files, o.files);
  const result = await o.store.write(rendered.workbook);
  if (result.status === "refused") await o.files.remove(rendered.files.map((f) => f.path));
  return result;
}

/** A stored workbook's files: its PDF and page images. */
const filesOf = (w: Pick<Workbook, "pdfPath" | "pages">) =>
  [w.pdfPath, ...w.pages.map((p) => p.image?.path ?? null)].filter((p): p is string => p !== null);

/**
 * Stores a new rendering of a stored workbook (`previous`, as read before rendering; render it with a new file key).
 * It stores the new files, then swaps the workbook to them in one step through the store (its id, page tokens, content
 * and status stay), then removes the old files. When an upload fails or the store refuses, it removes the new files and
 * the old rendering stays. When the swap's answer is lost, it reads the workbook: if the read names the new rendering,
 * the swap happened, so it removes the old files and answers written. Otherwise it removes nothing and throws: the swap
 * may still be pending in the database and commit later, so a read that names the old rendering does not prove the new
 * files are unused. Files no workbook names stay in the family's folder and go with the family.
 */
export async function replaceRendering(
  rendered: Extract<RenderResult, { status: "rendered" }>, o: { files: WorkbookFiles; store: WorkbookStore; previous: Workbook },
): Promise<WorkbookWrite> {
  const w = rendered.workbook;
  const fresh = rendered.files.map((f) => f.path);
  const old = filesOf(o.previous).filter((p) => !fresh.includes(p));
  const rendering: WorkbookRendering = {
    workbookId: w.id,
    pdfPath: w.pdfPath!,
    pages: w.pages.map((p) => ({ number: p.number, image: p.image!, questions: p.questions.map((q) => ({ number: q.number, box: q.box })) })),
  };
  await putAll(rendered.files, o.files);
  let result: WorkbookWrite;
  try {
    result = await o.store.saveRendering(rendering);
  } catch (e) {
    // Unless a read shows the swap happened, every file stays: the swap may still commit (a failed read shows nothing).
    if ((await o.store.workbook(w.id).catch(() => null))?.pdfPath !== rendering.pdfPath) throw e;
    await o.files.remove(old);
    return { status: "written", workbookId: w.id };
  }
  await o.files.remove(result.status === "written" ? old : fresh);
  return result;
}
