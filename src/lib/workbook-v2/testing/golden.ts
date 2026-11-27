// Golden books (architecture 11.1, product spec 18): a book is compared page by page with its baseline by the page model
// and by the pixels of the page image. The PDF hash is only information: a PDF can change bytes with the same pages, and
// two different pages are found in the pages. A changed page fails unless it is listed as accepted with the hashes of
// the new page: Cedric accepts a page that a child sees changed (its pixels), Savar or Cedric the others.
import { readPngPixels, type PngPixels } from "../checks/page-image";
import type { PageModel, Side } from "../contract";
import { canonicalJson, sha256 } from "../hash";
import { toPng } from "./raster";

export const APPROVERS = ["cedric", "savar"] as const;
export type Approver = (typeof APPROVERS)[number];
/** A page that a person read and accepted. `page` is the page in the book, from 1. A removed page has the hashes "none". */
export interface AcceptedChange { book: string; page: number; approver: Approver; reason: string; modelSha256: string; imageSha256: string }

/** What a baseline keeps of a page: its hashes, and a short hash of each part of its model, so a change can be named. */
export interface GoldenPageRecord {
  page: number;
  printedPage: number;
  sheetId: string;
  attempt: number;
  side: Side;
  modelSha256: string;
  /** The SHA-256 of the pixels, as colours on white paper: the same picture packed in another way has the same hash. */
  imageSha256: string;
  outline: Record<string, string>;
}
export interface GoldenBookRecord { book: string; inputHash: string; pdfSha256: string; pages: GoldenPageRecord[] }
export interface GoldenBaseline { format: 1; renderer: string; books: GoldenBookRecord[] }

/** A golden book as built: its pages with their models and images. */
export interface GoldenBuild { book: string; inputHash: string; pdf: Uint8Array; pages: readonly { model: PageModel; image: Uint8Array }[] }
/** The expected book: its record, and its page models and images when a full baseline holds them. */
export interface ExpectedBook { record: GoldenBookRecord; models?: readonly PageModel[]; images?: readonly Uint8Array[] }

export interface ModelDifference { path: string; expected: string; actual: string }
export type PixelDifference =
  | { kind: "pixels"; changed: number; maxDelta: number; box: { x: number; y: number; w: number; h: number } | null }
  | { kind: "size"; expected: { width: number; height: number }; actual: { width: number; height: number } }
  /** The baseline holds only the hash of the image: a full baseline (scripts/workbook-v2-golden.ts --baseline) gives the pixels. */
  | { kind: "hash-only" }
  | { kind: "unreadable"; message: string };

export interface PageChange {
  page: number;
  printedPage: number | null;
  what: "changed" | "added" | "removed";
  modelSha256: string;
  imageSha256: string;
  /** The parts of the model that changed: exact paths with a full baseline, the parts of the outline with a record. Empty: the model is the same. */
  model: ModelDifference[];
  /** Null: the pixels are the same. */
  pixels: PixelDifference | null;
  /** Whether a child sees the change: the pixels changed, or a page was added or removed. */
  childVisible: boolean;
  accepted: { approver: Approver; reason: string } | null;
  /** Why the accepted entries for this page do not accept it, when there are some. */
  refused: string[];
}

export interface GoldenComparison {
  book: string;
  ok: boolean;
  /** Information only: never decides `ok`. */
  pdf: { expected: string; actual: string; same: boolean };
  inputHash: { expected: string; actual: string; same: boolean };
  pages: { expected: number; actual: number };
  changes: PageChange[];
}

const NONE = "none";
const MAX_MODEL_DIFFERENCES = 50;
const SHORT = 16;

export const modelSha256 = (model: PageModel): string => sha256(canonicalJson(model));

/** Each pixel as red, green and blue on white paper, or why the image cannot be read. */
function onWhite(png: Uint8Array): (PngPixels & { rgb: Uint8Array }) | string {
  const read = readPngPixels(png);
  if (typeof read === "string") return read;
  const { width, height, parts, pixels } = read;
  const rgb = new Uint8Array(width * height * 3);
  for (let p = 0, at = 0; p < width * height; p++, at += parts) {
    const cover = parts === 4 ? pixels[at + 3] : 255;
    for (let c = 0; c < 3; c++) {
      const part = parts === 1 ? pixels[at] : pixels[at + c];
      rgb[p * 3 + c] = cover === 255 ? part : Math.round(255 - ((255 - part) * cover) / 255);
    }
  }
  return { ...read, rgb };
}

/** The hash of the picture: its size and its pixels on white paper. An image that cannot be read is hashed by its bytes. */
export function imageSha256(png: Uint8Array): string {
  const read = onWhite(png);
  if (typeof read === "string") return sha256(png);
  const head = new TextEncoder().encode(`rgb ${read.width}x${read.height}\n`);
  const all = new Uint8Array(head.length + read.rgb.length);
  all.set(head);
  all.set(read.rgb, head.length);
  return sha256(all);
}

/** A short hash of each field of the model, with the regions taken by their item (or their role when they have none). */
export function modelOutline(model: PageModel): Record<string, string> {
  const short = (value: unknown) => sha256(canonicalJson(value)).slice(0, SHORT);
  const outline: Record<string, string> = {};
  for (const [key, value] of Object.entries(model)) if (key !== "regions") outline[key] = short(value);
  const groups = new Map<string, unknown[]>();
  for (const region of model.regions) {
    const key = `regions[${region.item ?? region.role}]`;
    groups.set(key, [...(groups.get(key) ?? []), region]);
  }
  for (const [key, regions] of groups) outline[key] = short(regions);
  return outline;
}

export function goldenRecord(build: GoldenBuild): GoldenBookRecord {
  return {
    book: build.book,
    inputHash: build.inputHash,
    pdfSha256: sha256(build.pdf),
    pages: build.pages.map(({ model, image }, i) => ({
      page: i + 1, printedPage: model.page, sheetId: model.sheetId, attempt: model.attempt, side: model.side,
      modelSha256: modelSha256(model), imageSha256: imageSha256(image), outline: modelOutline(model),
    })),
  };
}

const show = (value: unknown): string => (value === undefined ? NONE : canonicalJson(value));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The paths where two models differ, such as `regions[3].ink[0].text`, up to `limit`. */
export function modelDifferences(expected: unknown, actual: unknown, limit = MAX_MODEL_DIFFERENCES): ModelDifference[] {
  const found: ModelDifference[] = [];
  const walk = (a: unknown, b: unknown, path: string) => {
    if (found.length >= limit || canonicalJson(a ?? null) === canonicalJson(b ?? null) && (a === undefined) === (b === undefined)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.max(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`);
    } else if (isObject(a) && isObject(b)) {
      for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) walk(a[key], b[key], path === "" ? key : `${path}.${key}`);
    } else found.push({ path: path === "" ? "(the model)" : path, expected: show(a), actual: show(b) });
  };
  walk(expected, actual, "");
  return found;
}

function outlineDifferences(expected: Record<string, string>, actual: Record<string, string>): ModelDifference[] {
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    .filter((key) => expected[key] !== actual[key])
    .map((key) => ({ path: key, expected: expected[key] ?? NONE, actual: actual[key] ?? NONE }));
}

/** The pixels that differ between two page images: how many, the largest change of one colour part, and the box around them. */
export function pixelDifference(expected: Uint8Array, actual: Uint8Array): PixelDifference {
  const [a, b] = [onWhite(expected), onWhite(actual)];
  if (typeof a === "string" || typeof b === "string") return { kind: "unreadable", message: typeof a === "string" ? `the expected image: ${a}` : `the new image: ${b}` };
  if (a.width !== b.width || a.height !== b.height) return { kind: "size", expected: { width: a.width, height: a.height }, actual: { width: b.width, height: b.height } };
  let [changed, maxDelta, x0, y0, x1, y1] = [0, 0, a.width, a.height, -1, -1];
  for (let p = 0; p < a.width * a.height; p++) {
    let delta = 0;
    for (let c = 0; c < 3; c++) delta = Math.max(delta, Math.abs(a.rgb[p * 3 + c] - b.rgb[p * 3 + c]));
    if (delta === 0) continue;
    const [x, y] = [p % a.width, Math.floor(p / a.width)];
    changed++;
    maxDelta = Math.max(maxDelta, delta);
    [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
  }
  return { kind: "pixels", changed, maxDelta, box: changed === 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } };
}

/** A grey PNG of the expected page, faded, with each changed pixel black: for a person who reads a changed page. */
export function differenceImage(expected: Uint8Array, actual: Uint8Array): Uint8Array | null {
  const [a, b] = [onWhite(expected), onWhite(actual)];
  if (typeof a === "string" || typeof b === "string" || a.width !== b.width || a.height !== b.height) return null;
  const grey = new Uint8Array(a.width * a.height);
  for (let p = 0; p < grey.length; p++) {
    const same = a.rgb[p * 3] === b.rgb[p * 3] && a.rgb[p * 3 + 1] === b.rgb[p * 3 + 1] && a.rgb[p * 3 + 2] === b.rgb[p * 3 + 2];
    grey[p] = same ? 255 - Math.round((255 - Math.min(a.rgb[p * 3], a.rgb[p * 3 + 1], a.rgb[p * 3 + 2])) / 4) : 0;
  }
  return toPng({ width: a.width, height: a.height, grey });
}

/** The accepted entry for a changed page, or the reasons each entry for that page does not accept it. */
function acceptance(change: Omit<PageChange, "accepted" | "refused">, book: string, accepted: readonly AcceptedChange[]): Pick<PageChange, "accepted" | "refused"> {
  const refused: string[] = [];
  for (const entry of accepted.filter((e) => e.book === book && e.page === change.page)) {
    const why: string[] = [];
    if (entry.modelSha256 !== change.modelSha256) why.push(`its model hash is ${entry.modelSha256}, the page now has ${change.modelSha256}`);
    if (entry.imageSha256 !== change.imageSha256) why.push(`its image hash is ${entry.imageSha256}, the page now has ${change.imageSha256}`);
    if (!APPROVERS.includes(entry.approver)) why.push(`the approver must be cedric or savar, not ${JSON.stringify(entry.approver)}`);
    else if (change.childVisible && entry.approver !== "cedric") why.push("a change that the child sees is accepted by cedric");
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") why.push("the reason is empty");
    if (why.length === 0) return { accepted: { approver: entry.approver, reason: entry.reason }, refused: [] };
    refused.push(`the accepted entry by ${String(entry.approver)} does not match: ${why.join("; ")}`);
  }
  return { accepted: null, refused };
}

/** The changed pages of a book, each accepted or not. The check passes when every changed page is accepted. */
export function compareGoldenBook(expected: ExpectedBook, actual: GoldenBuild, accepted: readonly AcceptedChange[] = []): GoldenComparison {
  const { record } = expected;
  const changes: PageChange[] = [];
  for (let i = 0; i < Math.max(record.pages.length, actual.pages.length); i++) {
    const [was, now] = [record.pages[i], actual.pages[i]];
    const nowModel = now ? modelSha256(now.model) : NONE;
    const nowImage = now ? imageSha256(now.image) : NONE;
    if (was && now && was.modelSha256 === nowModel && was.imageSha256 === nowImage) continue;
    const base = { page: i + 1, printedPage: now?.model.page ?? was?.printedPage ?? null, modelSha256: nowModel, imageSha256: nowImage };
    let change: Omit<PageChange, "accepted" | "refused">;
    if (!was || !now) change = { ...base, what: was ? "removed" : "added", model: [], pixels: null, childVisible: true };
    else {
      const wasModel = expected.models?.[i];
      const model = was.modelSha256 === nowModel ? [] : wasModel ? modelDifferences(wasModel, now.model) : outlineDifferences(was.outline, modelOutline(now.model));
      const wasImage = expected.images?.[i];
      const pixels = was.imageSha256 === nowImage ? null : wasImage ? pixelDifference(wasImage, now.image) : { kind: "hash-only" as const };
      change = { ...base, what: "changed", model, pixels, childVisible: pixels !== null };
    }
    changes.push({ ...change, ...acceptance(change, actual.book, accepted) });
  }
  const pdf = sha256(actual.pdf);
  return {
    book: actual.book,
    ok: changes.every((c) => c.accepted !== null),
    pdf: { expected: record.pdfSha256, actual: pdf, same: pdf === record.pdfSha256 },
    inputHash: { expected: record.inputHash, actual: actual.inputHash, same: record.inputHash === actual.inputHash },
    pages: { expected: record.pages.length, actual: actual.pages.length },
    changes,
  };
}

function pixelWords(pixels: PixelDifference): string {
  if (pixels.kind === "pixels") return pixels.box ? `${pixels.changed} pixels changed (largest change ${pixels.maxDelta}) in the box x ${pixels.box.x}, y ${pixels.box.y}, ${pixels.box.w} × ${pixels.box.h}` : "the pixels are the same";
  if (pixels.kind === "size") return `the size changed from ${pixels.expected.width} × ${pixels.expected.height} to ${pixels.actual.width} × ${pixels.actual.height}`;
  if (pixels.kind === "hash-only") return "the image hash changed (a full baseline gives the pixels)";
  return `the image cannot be compared: ${pixels.message}`;
}

/** The result of a golden check in plain words: each changed page, accepted or not, with what to put in the accepted list. */
export function goldenReport(comparisons: readonly GoldenComparison[]): string {
  const lines: string[] = [];
  for (const c of comparisons) {
    const changed = c.changes.length;
    lines.push(`${c.book}: ${changed === 0 ? "no changed page" : `${changed} changed ${changed === 1 ? "page" : "pages"}`}${c.ok ? "" : " (NOT ACCEPTED)"}.`);
    if (!c.inputHash.same) lines.push(`  The input hash changed: ${c.inputHash.expected} to ${c.inputHash.actual}.`);
    if (c.pages.expected !== c.pages.actual) lines.push(`  The book had ${c.pages.expected} pages and has ${c.pages.actual}.`);
    lines.push(`  PDF (information only): ${c.pdf.same ? "the same" : `${c.pdf.expected} to ${c.pdf.actual}`}.`);
    for (const p of c.changes) {
      const where = `page ${p.page}${p.printedPage === null ? "" : ` (printed page ${p.printedPage})`}`;
      lines.push(`  - ${where} ${p.what}${p.childVisible ? ", the child sees it" : ", the child does not see it"}: ${p.accepted ? `accepted by ${p.accepted.approver}: ${p.accepted.reason}` : "not accepted"}.`);
      for (const d of p.model.slice(0, 10)) lines.push(`      model ${d.path}: ${d.expected} -> ${d.actual}`);
      if (p.model.length > 10) lines.push(`      and ${p.model.length - 10} more model differences`);
      if (p.pixels) lines.push(`      ${pixelWords(p.pixels)}`);
      for (const why of p.refused) lines.push(`      ${why}`);
      if (!p.accepted) lines.push(`      To accept: ${JSON.stringify({ book: c.book, page: p.page, approver: p.childVisible ? "cedric" : "savar", reason: "…", modelSha256: p.modelSha256, imageSha256: p.imageSha256 })}`);
    }
  }
  return lines.join("\n");
}

const HEX = /^[0-9a-f]{64}$/;
const isHash = (v: unknown): v is string => typeof v === "string" && (HEX.test(v) || v === NONE);

/** The accepted list of a file, or each problem with it. An entry with a wrong approver or no reason is a problem here too. */
export function readAccepted(raw: unknown): AcceptedChange[] | string[] {
  if (!Array.isArray(raw)) return ["The accepted list must be a JSON list."];
  const problems: string[] = [];
  for (const [i, entry] of raw.entries()) {
    const at = `Accepted entry ${i + 1}`;
    if (!isObject(entry)) {
      problems.push(`${at} must be an object.`);
      continue;
    }
    if (Object.keys(entry).sort().join(",") !== "approver,book,imageSha256,modelSha256,page,reason") problems.push(`${at} must have exactly book, page, approver, reason, modelSha256 and imageSha256.`);
    if (typeof entry.book !== "string" || entry.book === "") problems.push(`${at}: book must be the name of a golden book.`);
    if (typeof entry.page !== "number" || !Number.isSafeInteger(entry.page) || entry.page < 1) problems.push(`${at}: page must be a whole number, 1 or more.`);
    if (!APPROVERS.includes(entry.approver as Approver)) problems.push(`${at}: approver must be cedric or savar.`);
    if (typeof entry.reason !== "string" || entry.reason.trim() === "") problems.push(`${at}: reason must not be empty.`);
    if (!isHash(entry.modelSha256) || !isHash(entry.imageSha256)) problems.push(`${at}: modelSha256 and imageSha256 must be SHA-256 hashes, or "none" for a removed page.`);
  }
  return problems.length > 0 ? problems : (raw as AcceptedChange[]);
}

/** A baseline of a file, or why it is not one. */
export function readBaseline(raw: unknown): GoldenBaseline | string {
  if (!isObject(raw) || raw.format !== 1 || typeof raw.renderer !== "string" || !Array.isArray(raw.books)) return "the golden baseline is not of format 1";
  const good = raw.books.every((b: unknown) => isObject(b) && typeof b.book === "string" && typeof b.inputHash === "string" && typeof b.pdfSha256 === "string" && Array.isArray(b.pages)
    && b.pages.every((p: unknown) => isObject(p) && typeof p.page === "number" && isHash(p.modelSha256) && isHash(p.imageSha256) && isObject(p.outline)));
  return good ? (raw as unknown as GoldenBaseline) : "a book of the golden baseline is not complete";
}
