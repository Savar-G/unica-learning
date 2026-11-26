// Reads a PDF file down to what it draws: filled rectangles, outlines and texts with their places. It reads only what the
// pinned Typst writes for a book. Everything else - a picture, a clip, a turn, a colour, a note - is refused by its name, so
// that nothing in the printed file is passed over.
import { inflateSync } from "node:zlib";
import type { Rect } from "../contract";

export type PdfInk =
  | { kind: "fill"; rect: Rect; grey: number }
  | { kind: "outline"; rect: Rect; grey: number; width: number }
  | { kind: "text"; x: number; y: number; w: number; glyphs: number; text: string; size: number; font: string; grey: number };

export interface PdfPage { size: { w: number; h: number }; ink: PdfInk[] }

/** What is wrong with the file, in plain words. */
class Refused extends Error {}
const CANNOT_READ = "cannot be read";
const refuse = (what: string): never => { throw new Refused(what); };
/** A value that must be there. */
const must = <T>(value: T | null | undefined): T => value ?? refuse(CANNOT_READ);

interface Name { name: string }
interface Ref { ref: number }
interface Text { text: string }
type Dict = Map<string, Value>;
type Value = number | Name | Ref | Text | Value[] | Dict | null;

const isNumber = (v: Value | undefined): v is number => typeof v === "number";
const isName = (v: Value | undefined): v is Name => typeof v === "object" && v !== null && "name" in v;
const isRef = (v: Value | undefined): v is Ref => typeof v === "object" && v !== null && "ref" in v;
const isText = (v: Value | undefined): v is Text => typeof v === "object" && v !== null && "text" in v;

const TOKEN = /[\0\t\n\f\r ]*(?:(<<|>>|\[|\]|\()|\/([^\0\t\n\f\r ()<>[\]{}/%]*)|([+-]?(?:\d+\.?\d*|\.\d+)(?![\d.]))|<([0-9A-Fa-f\s]*)>|([A-Za-z'"][A-Za-z0-9*'"]*))/y;
const ESCAPES: Readonly<Record<string, string>> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };

/** A text in round brackets, which may hold pairs of them, and where it ends. */
function readText(source: string, from: number): { text: string; end: number } {
  let text = "";
  let depth = 1;
  for (let at = from; at < source.length; at++) {
    const c = source[at];
    if (c === "\\") {
      const octal = /^[0-7]{1,3}/.exec(source.slice(at + 1, at + 4));
      const next = source[at + 1];
      if (octal) text += String.fromCharCode(parseInt(octal[0], 8) & 255);
      else if (next !== "\n") text += ESCAPES[next] ?? next;
      at += octal ? octal[0].length : 1;
      continue;
    }
    depth += c === "(" ? 1 : c === ")" ? -1 : 0;
    if (depth === 0) return { text, end: at + 1 };
    text += c;
  }
  return refuse(CANNOT_READ);
}

const hexText = (hex: string): string => (hex.replace(/\s/g, "").match(/../g) ?? []).map((b) => String.fromCharCode(parseInt(b, 16))).join("");

function dictOf(values: readonly Value[]): Dict {
  const dict: Dict = new Map();
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i];
    if (!isName(key) || i + 1 >= values.length) return refuse(CANNOT_READ);
    dict.set(key.name, values[i + 1]);
  }
  return dict;
}

/** Reads values and gives each command the values before it, until a command answers that it is the last one. It gives the place after it. */
function readCommands(source: string, from: number, command: (name: string, values: Value[]) => boolean): number {
  const open: { values: Value[]; close: string }[] = [{ values: [], close: "" }];
  let at = from;
  for (;;) {
    TOKEN.lastIndex = at;
    const token = TOKEN.exec(source);
    if (!token) {
      if (source.slice(at).trim() !== "" || open.length !== 1 || open[0].values.length > 0) refuse(CANNOT_READ);
      return source.length;
    }
    at = TOKEN.lastIndex;
    const [, sign, name, number, hex, word] = token;
    const top = open[open.length - 1];
    if (sign === "<<" || sign === "[") open.push({ values: [], close: sign === "[" ? "]" : ">>" });
    else if (sign === "(") {
      const { text, end } = readText(source, at);
      top.values.push({ text });
      at = end;
    } else if (sign !== undefined) {
      if (top.close !== sign) refuse(CANNOT_READ);
      open.pop();
      open[open.length - 1].values.push(sign === "]" ? top.values : dictOf(top.values));
    } else if (name !== undefined) top.values.push({ name });
    else if (number !== undefined) top.values.push(Number(number));
    else if (hex !== undefined) top.values.push({ text: hexText(hex) });
    else if (word === "R") {
      const [object, generation] = top.values.splice(-2);
      if (!isNumber(object) || generation !== 0) refuse(CANNOT_READ);
      else top.values.push({ ref: object });
    } else if (["true", "false", "null"].includes(word)) top.values.push(null);
    else {
      if (open.length !== 1) refuse(CANNOT_READ);
      if (command(word, top.values.splice(0))) return at;
    }
  }
}

const MAX_STREAM_BYTES = 64 * 1024 * 1024;

/** The objects of a file, found by the table at its end. */
class PdfFile {
  private readonly source: string;
  private readonly places: number[];
  readonly root: Value;

  constructor(private readonly bytes: Uint8Array) {
    this.source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length).toString("latin1");
    const [, start] = must(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(this.source.slice(-64)));
    const table = must(/^xref\n0 (\d+)\n((?:\d{10} \d{5} [fn]\r\n)+)trailer/.exec(this.source.slice(Number(start))));
    this.places = table[2].trim().split("\r\n").map((line) => Number(line.slice(0, 10)));
    if (this.places.length !== Number(table[1])) refuse(CANNOT_READ);
    let trailer: Value = null;
    readCommands(this.source, Number(start) + table[0].length, (word, values) => { [trailer] = values; return word === "startxref"; });
    this.root = this.dict(trailer).get("Root") ?? null;
  }

  /** The value of an object, and where its stream starts. */
  private object(number: number): { value: Value; end: number; hasStream: boolean } {
    const place = must(this.places[number]);
    const head = `${number} 0 obj`;
    if (number < 1 || !this.source.startsWith(head, place)) refuse(CANNOT_READ);
    let value: Value = null;
    let hasStream = false;
    const end = readCommands(this.source, place + head.length, (word, values) => {
      if ((word !== "endobj" && word !== "stream") || values.length !== 1) refuse(CANNOT_READ);
      [value] = values;
      hasStream = word === "stream";
      return true;
    });
    return { value, end, hasStream };
  }

  value(given: Value | undefined): Value {
    return isRef(given) ? this.object(given.ref).value : given ?? null;
  }

  dict(given: Value | undefined): Dict {
    const value = this.value(given);
    return value instanceof Map ? value : refuse(CANNOT_READ);
  }

  list(given: Value | undefined): Value[] {
    const value = this.value(given);
    return Array.isArray(value) ? value : refuse(CANNOT_READ);
  }

  stream(given: Value | undefined): { dict: Dict; text: string } {
    const { value, end, hasStream } = isRef(given) ? this.object(given.ref) : refuse(CANNOT_READ);
    const dict = this.dict(value);
    const length = dict.get("Length");
    const filter = dict.get("Filter");
    if (!hasStream || !isNumber(length) || this.source[end] !== "\n" || !/^\s*endstream/.test(this.source.slice(end + 1 + length, end + 21 + length))) return refuse(CANNOT_READ);
    const packed = this.bytes.subarray(end + 1, end + 1 + length);
    if (filter === undefined) return { dict, text: this.source.slice(end + 1, end + 1 + length) };
    if (!isName(filter) || filter.name !== "FlateDecode") return refuse(CANNOT_READ);
    return { dict, text: Buffer.from(inflateSync(packed, { maxOutputLength: MAX_STREAM_BYTES })).toString("latin1") };
  }
}

/** A part of the file that has only these keys: another key can change what is printed. */
function checkKeys(what: string, dict: Dict, known: readonly string[]): void {
  const other = [...dict.keys()].find((key) => !known.includes(key));
  if (other !== undefined) refuse(`has a ${what} with "${other}", which no page of a book has`);
}

interface Font { name: string; textOf: ReadonlyMap<number, string>; widthOf(code: number): number }

function readWidths(list: readonly Value[], fallback: number): (code: number) => number {
  const ranges: { first: number; last: number; width: number }[] = [];
  for (let i = 0; i < list.length;) {
    const [first, next, width] = list.slice(i, i + 3);
    if (!isNumber(first)) return refuse(CANNOT_READ);
    if (Array.isArray(next)) {
      next.forEach((w, k) => ranges.push({ first: first + k, last: first + k, width: isNumber(w) ? w : refuse(CANNOT_READ) }));
      i += 2;
    } else if (isNumber(next) && isNumber(width)) {
      ranges.push({ first, last: next, width });
      i += 3;
    } else return refuse(CANNOT_READ);
  }
  return (code) => ranges.find((r) => code >= r.first && code <= r.last)?.width ?? fallback;
}

function readFont(file: PdfFile, given: Value | undefined): Font {
  const font = file.dict(given);
  const base = font.get("BaseFont");
  const [own] = file.list(font.get("DescendantFonts"));
  const { text } = file.stream(font.get("ToUnicode"));
  const textOf = new Map<number, string>();
  for (const [, block] of text.matchAll(/beginbfchar([^]*?)endbfchar/g)) {
    for (const [, code, value] of block.matchAll(/<([0-9A-Fa-f]{4})>\s*<((?:[0-9A-Fa-f]{4})+)>/g)) textOf.set(parseInt(code, 16), (value.match(/.{4}/g) ?? []).map((c) => String.fromCharCode(parseInt(c, 16))).join(""));
  }
  if (/beginbfrange/.test(text)) refuse(CANNOT_READ);
  const widths = file.dict(own);
  const fallback = widths.get("DW");
  return { name: isName(base) ? base.name.replace(/^[A-Z]{6}\+/, "") : refuse(CANNOT_READ), textOf, widthOf: readWidths(file.list(widths.get("W")), isNumber(fallback) ? fallback : refuse(CANNOT_READ)) };
}

/** What q saves and Q gives back: the place, the colours, the line, and the font and its size. A text matrix is not in it. */
interface Graphics { x: number; y: number; flipped: boolean; fill: number; stroke: number; width: number; font: Font | null; size: number }

const CLOSE = 0.001;

/** The rectangle of a closed path of four corners. */
function rectOf(path: readonly (readonly [number, number])[], closed: boolean): Rect {
  const [xs, ys] = [path.map(([x]) => x), path.map(([, y]) => y)];
  const [x, y, r, b] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  const corners = [[x, y], [r, y], [r, b], [x, b]];
  const is = (from: number, step: number) => path.every((p, i) => Math.abs(p[0] - corners[(from + step * i + 8) % 4][0]) < CLOSE && Math.abs(p[1] - corners[(from + step * i + 8) % 4][1]) < CLOSE);
  const isRect = closed && path.length === 4 && [0, 1, 2, 3].some((from) => is(from, 1) || is(from, -1));
  return isRect ? { x, y, w: r - x, h: b - y } : refuse("has a shape that is not a rectangle");
}

const IGNORED = new Set(["BMC", "BDC", "EMC"]);
/** Commands that a page has, and that may not come between a path and its paint. */
const BETWEEN = new Set(["q", "Q", "cm", "cs", "CS", "scn", "SCN", "w", "M", "BT", "ET", "Tr", "Tf", "Tm", "Tj", "TJ", "BMC", "BDC", "EMC"]);

/**
 * How far one letter may stand from the end of the one before it, in thousandths of the size of the text: the kerning of
 * the fonts of the engine, over all pairs of characters that may be printed, and 1 more. Every other move is refused, also
 * one that a later move takes back.
 */
const KERNING = { least: -31, most: 161 };

/** What the drawing commands of a page draw, in their order. */
function readDrawing(content: string, height: number, fonts: ReadonlyMap<string, Font>, greys: ReadonlySet<string>): PdfInk[] {
  const ink: PdfInk[] = [];
  let now: Graphics = { x: 0, y: 0, flipped: false, fill: 0, stroke: 0, width: 1, font: null, size: 0 };
  const saved: Graphics[] = [];
  let path: [number, number][] = [];
  let closed = false;
  let text: { placed: boolean } | null = null;
  /** A point of the page, from its top left corner. */
  const point = (x: number, y: number): [number, number] => [now.x + x, height - (now.y + (now.flipped ? -y : y))];
  const shape = (): Rect => {
    const rect = rectOf(path.map(([x, y]) => point(x, y)), closed);
    path = [];
    closed = false;
    return rect;
  };
  const write = (parts: readonly Value[]) => {
    const font = text ? now.font ?? refuse("has a font that it does not name") : refuse(CANNOT_READ);
    if (!text?.placed || !now.flipped) return refuse(TURNED);
    let written = "";
    let width = 0;
    let move = 0;
    let glyphs = 0;
    for (const part of parts) {
      if (isNumber(part)) {
        move -= part;
        continue;
      }
      if (!isText(part) || part.text.length % 2 !== 0) return refuse(CANNOT_READ);
      // An empty text shows no letter, so a move before it and one after it are one move.
      if (part.text === "") continue;
      if (glyphs === 0 && move !== 0) return refuse("moves the start of a text");
      if (!(-move >= KERNING.least && -move <= KERNING.most)) return refuse(`moves a letter ${-move} thousandths of its size, which no font of a book does`);
      width += move;
      move = 0;
      glyphs += part.text.length / 2;
      for (let i = 0; i < part.text.length; i += 2) {
        const code = part.text.charCodeAt(i) * 256 + part.text.charCodeAt(i + 1);
        written += font.textOf.get(code) ?? refuse("has a character that it does not name");
        width += font.widthOf(code);
      }
    }
    if (move !== 0) return refuse("moves the end of a text");
    const [x, y] = point(0, 0);
    // The space between two tokens of a flow is a text of its own, and draws nothing.
    if (written.trim() !== "") ink.push({ kind: "text", x, y, w: (width * now.size) / 1000, glyphs, text: written, size: now.size, font: font.name, grey: now.fill });
    text.placed = false;
  };
  const TURNED = "turns, tilts or scales what it draws";
  const upright = (v: readonly number[]) => v.length === 6 && v[0] === 1 && v[1] === 0 && v[2] === 0 && v[3] === -1;

  readCommands(content, 0, (name, values) => {
    const numbers = values.filter(isNumber);
    const [first] = values;
    // A path has its place when it is made, so nothing may come between it and its paint.
    if (path.length > 0 && BETWEEN.has(name)) refuse("has a shape that is not painted at once");
    const unknown = () => refuse(`has the drawing command "${name}"${numbers.length > 0 && name === "Tr" ? ` with ${numbers.join(" ")}` : ""}, which no page of a book has`);
    const count = (n: number) => { if (numbers.length !== n || values.length !== n) refuse(CANNOT_READ); };
    const colour = () => (numbers.length === 1 && values.length === 1 ? numbers[0] : refuse("has a colour that is not a grey"));
    switch (name) {
      case "q": saved.push({ ...now }); break;
      case "Q": now = must(saved.pop()); break;
      case "cm": {
        if (now.flipped || !upright(numbers)) refuse(TURNED);
        now = { ...now, x: now.x + numbers[4], y: now.y + numbers[5], flipped: true };
        break;
      }
      // A colour space starts with its first colour, which is black for a grey: a space for the paint, and one for the lines.
      case "cs": case "CS":
        if (!isName(first) || !greys.has(first.name)) refuse("has a colour that is not a grey");
        if (name === "cs") now.fill = 0;
        else now.stroke = 0;
        break;
      case "scn": now.fill = colour(); break;
      case "SCN": now.stroke = colour(); break;
      case "w": count(1); [now.width] = numbers; break;
      // Outlines join in a point. At a right angle the point is √2 times the line wide, and a smaller limit cuts it off.
      case "M": count(1); if (!(numbers[0] > Math.SQRT2)) refuse("cuts the corners of its outlines"); break;
      case "m": count(2); if (path.length > 0) refuse("has a shape that is not a rectangle"); path = [[numbers[0], numbers[1]]]; break;
      case "l": count(2); path.push([numbers[0], numbers[1]]); break;
      case "h": closed = true; break;
      case "f": ink.push({ kind: "fill", rect: shape(), grey: now.fill }); break;
      case "S": ink.push({ kind: "outline", rect: shape(), grey: now.stroke, width: now.width }); break;
      case "BT": text = { placed: false }; break;
      case "ET": text = null; break;
      case "Tr": if (numbers[0] !== 0) unknown(); break;
      case "Tf":
        now.font = (isName(first) ? fonts.get(first.name) : undefined) ?? refuse("has a font that it does not name");
        now.size = must(numbers[0]);
        break;
      case "Tm": {
        if (!text || !upright(numbers) || numbers[4] !== 0 || numbers[5] !== 0) refuse(TURNED);
        else text.placed = true;
        break;
      }
      case "Tj": write(values); break;
      case "TJ": write(Array.isArray(first) ? first : refuse(CANNOT_READ)); break;
      default: if (!IGNORED.has(name)) unknown();
    }
    return false;
  });
  return ink;
}

function readPage(file: PdfFile, page: Dict): PdfPage {
  checkKeys("page", page, ["Type", "Resources", "MediaBox", "StructParents", "Parent", "Contents", "Tabs"]);
  const box = file.list(page.get("MediaBox"));
  const [x, y, w, h] = box;
  if (box.length !== 4 || x !== 0 || y !== 0 || !isNumber(w) || !isNumber(h)) return refuse(CANNOT_READ);
  const resources = file.dict(page.get("Resources"));
  const part = (key: string) => (resources.has(key) ? file.dict(resources.get(key)) : new Map<string, Value>());
  const greys = new Set<string>();
  for (const [name, value] of part("ColorSpace")) {
    const [kind, profile] = file.list(value);
    if (isName(kind) && kind.name === "ICCBased" && file.stream(profile).dict.get("N") === 1) greys.add(name);
  }
  const fonts = new Map([...part("Font")].map(([name, value]) => [name, readFont(file, value)]));
  return { size: { w, h }, ink: readDrawing(file.stream(page.get("Contents")).text, h, fonts, greys) };
}

const MAX_DEPTH = 20;

/** The pages of a list of pages, which names each one with its object, one time: a page has one place in the book. */
function pageNodes(file: PdfFile, given: Value | undefined, seen: Set<number>, depth = 0): Dict[] {
  if (!isRef(given)) return refuse(CANNOT_READ);
  if (seen.has(given.ref)) return refuse("names a page more than one time");
  seen.add(given.ref);
  const node = file.dict(given);
  const type = node.get("Type");
  if (!isName(type) || depth > MAX_DEPTH) return refuse(CANNOT_READ);
  if (type.name === "Page") return [node];
  checkKeys("list of pages", node, ["Type", "Count", "Kids", "Parent"]);
  return file.list(node.get("Kids")).flatMap((kid) => pageNodes(file, kid, seen, depth + 1));
}

const readPages = (file: PdfFile, given: Value | undefined): PdfPage[] => pageNodes(file, given, new Set()).map((page) => readPage(file, page));

/** What each page of the file draws, or what is wrong with the file. */
export function readPdf(pdf: Uint8Array): PdfPage[] | string {
  try {
    const file = new PdfFile(pdf);
    const catalog = file.dict(file.root);
    checkKeys("catalog", catalog, ["Type", "Pages", "Metadata", "Lang", "StructTreeRoot", "MarkInfo", "ViewerPreferences"]);
    return readPages(file, catalog.get("Pages"));
  } catch (error) {
    // A part that cannot be unpacked is a file that cannot be read.
    return error instanceof Refused ? error.message : CANNOT_READ;
  }
}
