// The print engine (#309): headless Chromium through puppeteer-core, used only to lay out and print workbook pages
// (the Aside rule in AGENTS.md covers browser checks, not this). One browser per print job: it loads the document with
// print styles, waits for its fonts, measures every [data-measure] element against its sheet (with whether it shows),
// takes one PNG of each sheet at the job's scale and prints the PDF (and counts its pages). It reads each page's QR code
// back from that PNG with jsQR, in the area of the sheet's qr element, so a QR code that is blank, covered or wrong
// does not pass.
//
// It checks each marked element's text line by line (MeasuredElement.textPrinted). A line prints when CSS shows it
// (visible, not transparent, under no filter, clip-path or mask up to its marked element), it is at least 6 points
// high, at least 85% of it lies inside every box that clips it (up to its sheet), and its own glyphs leave ink: the
// engine takes the sheet's PNG again with the glyphs of the line's piece of text gone and every glyph that could reach
// it kept, and the line's pixels must change. So text that is hidden, tiny, clipped, white on white or covered (by a
// box, or by another line that brings its own ink to the same place) does not pass.
//
// The ink check, after the PDF and page images: each piece of marked text is put in a plain span (the engine checks
// that no line moved), and a check image hides a set of spans with opacity 0. A set holds pieces whose glyphs cannot
// reach each other's lines: glyphs stay within one line height of their line, so pieces are kept apart by that much
// (inkSets). On a sheet where paint can carry a glyph's ink further (a text shadow, filter, backdrop filter or
// reflection anywhere on it), each piece gets its own image. A sample practice page takes 2 check images.
//
// Which Chromium: CHROMIUM_PATH when set; on Linux (a Vercel function) the serverless build @sparticuz/chromium; on a
// Mac, the installed Google Chrome or Chromium. Server only: no Next.js.
import { existsSync } from "node:fs";
import jsQR from "jsqr";
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import type { MeasuredElement, PrintEngine } from "@/lib/workbook-render";

const MAC_BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

/** Where Chromium is and how to start it, or null when there is none here. */
export async function findChromium(): Promise<{ executablePath: string; args: string[] } | null> {
  if (process.env.CHROMIUM_PATH) return { executablePath: process.env.CHROMIUM_PATH, args: [] };
  if (process.platform === "linux") {
    const chromium = (await import("@sparticuz/chromium")).default;
    return { executablePath: await chromium.executablePath(), args: chromium.args };
  }
  const local = MAC_BROWSERS.find((p) => existsSync(p));
  return local ? { executablePath: local, args: [] } : null;
}

// Runs in the page: each sheet, then each marked element in it, measured from the sheet's top left corner, with each
// line of each piece of its text (runs): whether CSS shows it, its rect, and the share of it that no box clips. A
// string, so no build step can rename or wrap what runs in the browser.
// Each piece of text gets a number (node), the same wherever it is measured; the pieces stay in window.__inkNodes for
// INK_SPANS.
const MEASURE = `(() => { const ids = new Map(); const found = [...document.querySelectorAll("[data-sheet]")].flatMap((sheet, i) => {
  const origin = sheet.getBoundingClientRect();
  const opts = { checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true };
  const alpha = (c) => { const m = /^rgba\((.+)\)$/.exec(c); return m ? parseFloat(m[1].split(",")[3]) : 1; };
  const shows = (p, el) => {
    if (!p.checkVisibility(opts)) return false;
    const cs = getComputedStyle(p);
    if (!(alpha(cs.color) > 0 && alpha(cs.webkitTextFillColor) > 0)) return false;
    for (let a = p; a; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.filter !== "none" || s.clipPath !== "none" || s.maskImage !== "none" || s.webkitMaskImage !== "none") return false;
      if (a === el) return true;
    }
    return false;
  };
  const unclipped = (p, q) => {
    let l = q.left, t = q.top, r = q.right, b = q.bottom;
    for (let a = p; a && a !== sheet.parentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const c = a.getBoundingClientRect();
      l = Math.max(l, c.left); t = Math.max(t, c.top); r = Math.min(r, c.right); b = Math.min(b, c.bottom);
    }
    return r > l && b > t ? ((r - l) * (b - t)) / (q.width * q.height) : 0;
  };
  return [sheet, ...sheet.querySelectorAll("[data-measure]")].map((el) => {
    const r = el.getBoundingClientRect();
    const runs = [];
    if (el !== sheet) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        if (!t.data.trim()) continue;
        if (!ids.has(t)) ids.set(t, ids.size);
        const node = ids.get(t);
        const css = shows(t.parentElement, el);
        const range = document.createRange();
        range.selectNodeContents(t);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (!rects.length) runs.push({ node, css: false, x: 0, y: 0, width: 0, height: 0, unclipped: 0 });
        for (const q of rects) {
          runs.push({ node, css, x: q.left - origin.left, y: q.top - origin.top, width: q.width, height: q.height, unclipped: unclipped(t.parentElement, q) });
        }
      }
    }
    return {
      sheet: i, name: el.getAttribute("data-measure"), text: (el.textContent || "").trim().slice(0, 200),
      visible: r.width > 0 && r.height > 0 && el.checkVisibility(opts),
      x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height,
      clientWidth: el.clientWidth, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
      runs,
    };
  });
});
window.__inkNodes = [...ids.keys()];
return found; })()`;

/** For each sheet, whether paint on it can carry a glyph's ink beyond one line height (so each piece is checked alone). */
const SPREADS = `[...document.querySelectorAll("[data-sheet]")].map((sheet) => [sheet, ...sheet.querySelectorAll("*")].some((e) => {
  const s = getComputedStyle(e);
  return s.textShadow !== "none" || s.filter !== "none" || s.backdropFilter !== "none" || (s.webkitBoxReflect || "none") !== "none";
}))`;

/** Puts each measured piece of text in a plain span (data-ink = its node), and gives each line of it again, to check
 * that nothing moved. */
const INK_SPANS = `window.__inkNodes.map((t, node) => {
  const span = document.createElement("span");
  span.setAttribute("data-ink", String(node));
  t.parentNode.insertBefore(span, t);
  span.appendChild(t);
  const origin = span.closest("[data-sheet]").getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(t);
  return [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0)
    .map((q) => ({ x: q.left - origin.left, y: q.top - origin.top, width: q.width, height: q.height }));
})`;

/** A line of a piece of a marked element's text, as MEASURE finds it: the piece (node), rect in CSS pixels, and the
 * share no box clips. */
type Run = { node: number; css: boolean; x: number; y: number; width: number; height: number; unclipped: number };
type Rect = { x: number; y: number; width: number; height: number };

const overlap = (a: Rect, b: Rect, pad: number) => a.x - pad < b.x + b.width && b.x < a.x + a.width + pad
  && a.y - pad < b.y + b.height && b.y < a.y + a.height + pad;

/**
 * The sets of pieces of text whose glyphs can go in one check image: no piece's lines, grown by their own height, reach
 * a line of another piece in its set; with `alone`, one piece a set.
 */
function inkSets(pieces: ReadonlyMap<number, readonly Rect[]>, alone: boolean): number[][] {
  const near = (a: readonly Rect[], b: readonly Rect[]) => a.some((p) => b.some((q) => overlap(p, q, p.height) || overlap(q, p, q.height)));
  const sets: number[][] = [];
  for (const [node, lines] of pieces) {
    const set = alone ? undefined : sets.find((s) => s.every((other) => !near(lines, pieces.get(other)!)));
    if (set) set.push(node);
    else sets.push([node]);
  }
  return sets;
}

/** A page image in grey, one byte a pixel. */
type Grey = { data: Uint8Array; width: number; height: number };

/** A page image in grey. */
async function grey(png: Uint8Array): Promise<Grey> {
  const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** A rect in CSS pixels, grown by `pad` on each side, as whole pixels of an image of the given size; null when empty. */
function crop(r: { x: number; y: number; width: number; height: number }, scale: number, size: { width: number; height: number }, pad = 0) {
  const left = Math.max(0, Math.floor((r.x - pad) * scale));
  const top = Math.max(0, Math.floor((r.y - pad) * scale));
  const right = Math.min(size.width, Math.ceil((r.x + r.width + pad) * scale));
  const bottom = Math.min(size.height, Math.ceil((r.y + r.height + pad) * scale));
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

/** The smallest line of text that counts as printed: 6 points (8 CSS pixels) high. */
const LINE_MIN = 8;
/** The least share of a line that must lie inside every box that clips it. */
const UNCLIPPED_MIN = 0.85;
/** How much a pixel must change (of 255) when the glyphs go, to count as their ink. */
const INK = 64;
/** The least share of a line's pixels that must be its ink. */
const INK_MIN = 0.02;

/** Whether a line's own glyphs leave ink: enough of its pixels change when they go. */
function inked(r: Rect, withText: Grey, withoutText: Grey, scale: number): boolean {
  const c = crop(r, scale, withText);
  if (!c) return false;
  let ink = 0;
  for (let y = c.top; y < c.top + c.height; y++) {
    for (let x = c.left; x < c.left + c.width; x++) {
      const at = y * withText.width + x;
      if (Math.abs(withText.data[at] - withoutText.data[at]) >= INK) ink++;
    }
  }
  return ink >= INK_MIN * c.width * c.height;
}

/** Whether all of an element's text prints: it has text, and every line of it shows, is big enough, is not clipped and
 * leaves its own ink on the page image (`inkedLines`: the lines whose glyphs left ink, by node and place). */
const textPrinted = (runs: Run[], inkedLines: ReadonlySet<string>) => runs.length > 0
  && runs.every((r) => r.css && r.height >= LINE_MIN && r.unclipped >= UNCLIPPED_MIN && inkedLines.has(lineKey(r)));

const lineKey = (r: Rect & { node: number }) => `${r.node}:${r.x}:${r.y}:${r.width}:${r.height}`;
const sameRect = (a: Rect, b: Rect | undefined) => !!b && (["x", "y", "width", "height"] as const).every((k) => Math.abs(a[k] - b[k]) <= 0.01);

/** Each sheet's top in the document, in CSS pixels. */
const SHEET_TOPS = `[...document.querySelectorAll("[data-sheet]")].map((s) => s.getBoundingClientRect().top + window.scrollY)`;

/** The text of the QR code in a page image, read in the area of a measured element and 0.25 inches around it. */
async function readQr(png: Uint8Array, at: Pick<MeasuredElement, "x" | "y" | "width" | "height"> | undefined, scale: number): Promise<string | null> {
  if (!at) return null;
  const c = crop(at, scale, pngSize(png), 24);
  if (!c) return null;
  const { data, info } = await sharp(png).extract(c).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength), info.width, info.height)?.data ?? null;
}

/** A PNG's size from its header. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The page count of a PDF Chromium printed: its page objects, which Chromium writes uncompressed. */
const pdfPageCount = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf).match(/\/Type\s*\/Page\b/g)?.length ?? 0;

export function chromiumPrintEngine(): PrintEngine {
  return {
    async print(job) {
      const chromium = await findChromium();
      if (!chromium) throw new Error("print engine: no Chromium here; set CHROMIUM_PATH");
      const browser = await puppeteer.launch({ ...chromium, headless: true });
      try {
        const page = await browser.newPage();
        await page.setViewport({ width: job.page.width, height: job.page.height, deviceScaleFactor: job.scale });
        await page.emulateMediaType("print");
        await page.setContent(job.html, { waitUntil: "load" });
        await page.evaluate("document.fonts.ready.then(() => true)");
        const found = await page.evaluate(MEASURE) as (Omit<MeasuredElement, "textPrinted"> & { runs: Run[] })[];
        const tops = await page.evaluate(SHEET_TOPS) as number[];
        if (tops.length !== job.sheets) throw new Error(`print engine: ${tops.length} sheets for ${job.sheets}`);
        const shoot = (top: number) => page.screenshot({
          type: "png", captureBeyondViewport: true, clip: { x: 0, y: top, width: job.page.width, height: job.page.height },
        });
        const images = [];
        for (const [i, top] of tops.entries()) {
          const png = await shoot(top);
          const qr = found.find((m) => m.sheet === i && m.name === "qr");
          images.push({ png, ...pngSize(png), qrText: await readQr(png, qr, job.scale) });
        }
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });

        // Then the ink check: the PDF and the page images above are done.
        const spreads = await page.evaluate(SPREADS) as boolean[];
        // Each piece's lines, once: a piece inside nested marked elements is measured once for each.
        const lines = new Map<number, Map<string, Rect>>();
        for (const m of found) {
          for (const { node, x, y, width, height } of m.runs) {
            if (!lines.has(node)) lines.set(node, new Map());
            if (width > 0) lines.get(node)!.set(lineKey({ node, x, y, width, height }), { x, y, width, height });
          }
        }
        const after = await page.evaluate(INK_SPANS) as Rect[][];
        for (const [node, rs] of lines) {
          if (![...rs.values()].every((r, i) => sameRect(r, after[node][i])) || rs.size !== after[node].length) {
            throw new Error(`print engine: text moved when put in a span for the ink check (piece ${node})`);
          }
        }
        const hide = await page.addStyleTag({ content: "/* ink check */" });
        const inkedLines = new Set<string>();
        for (const [i, top] of tops.entries()) {
          const pieces = new Map([...lines]
            .filter(([node]) => found.some((m) => m.sheet === i && m.runs.some((r) => r.node === node)))
            .map(([node, rs]) => [node, [...rs.values()]]));
          if (!pieces.size) continue;
          const withText = await grey(images[i].png);
          for (const set of inkSets(pieces, spreads[i])) {
            await hide.evaluate((el, css) => { el.textContent = css; }, `${set.map((n) => `[data-ink="${n}"]`).join(",")}{opacity:0!important}`);
            const withoutText = await grey(await shoot(top));
            for (const node of set) {
              for (const r of pieces.get(node)!) if (inked(r, withText, withoutText, job.scale)) inkedLines.add(lineKey({ ...r, node }));
            }
          }
        }
        const measured = found.map(({ runs, ...m }) => ({ ...m, textPrinted: textPrinted(runs, inkedLines) }));
        return { pdf, pdfPages: pdfPageCount(pdf), images, measured };
      } finally {
        await browser.close();
      }
    },
  };
}
