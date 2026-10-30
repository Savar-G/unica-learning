// The print engine (#309): headless Chromium through puppeteer-core, used only to lay out and print workbook pages
// (the Aside rule in AGENTS.md covers browser checks, not this). One browser per print job: it loads the document with
// print styles, waits for its fonts, measures every [data-measure] element against its sheet (with whether it shows),
// prints the PDF (and counts its pages) and takes one PNG of each sheet at the job's scale. It reads each page's QR code
// back from that PNG with jsQR, in the area of the sheet's qr element, so a QR code that is blank, covered or wrong
// does not pass. It checks each marked element's text piece by piece: each piece must show by CSS, have a colour that is
// not transparent, lie inside the element, and leave ink on the PNG (light and dark pixels where it is), so text that is
// hidden, clipped, white on white or covered inside a visible element does not pass.
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
// line of each piece of its text (runs): whether CSS shows it (visible, a font size, a colour that is not transparent)
// and its rect. A string, so no build step can rename or wrap what runs in the browser.
const MEASURE = `[...document.querySelectorAll("[data-sheet]")].flatMap((sheet, i) => {
  const origin = sheet.getBoundingClientRect();
  const opts = { checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true };
  const alpha = (c) => { const m = /^rgba\((.+)\)$/.exec(c); return m ? parseFloat(m[1].split(",")[3]) : 1; };
  return [sheet, ...sheet.querySelectorAll("[data-measure]")].map((el) => {
    const r = el.getBoundingClientRect();
    const runs = [];
    if (el !== sheet) {
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let t = walk.nextNode(); t; t = walk.nextNode()) {
        if (!t.data.trim()) continue;
        const p = t.parentElement;
        const cs = getComputedStyle(p);
        const css = p.checkVisibility(opts) && parseFloat(cs.fontSize) > 0 && alpha(cs.color) > 0 && alpha(cs.webkitTextFillColor) > 0;
        const range = document.createRange();
        range.selectNodeContents(t);
        const rects = [...range.getClientRects()].filter((q) => q.width > 0 && q.height > 0);
        if (!rects.length) runs.push({ css: false, x: 0, y: 0, width: 0, height: 0 });
        for (const q of rects) runs.push({ css, x: q.left - origin.left, y: q.top - origin.top, width: q.width, height: q.height });
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
})`;

/** A line of a piece of a marked element's text, as MEASURE finds it. */
type Run = { css: boolean; x: number; y: number; width: number; height: number };

/** A page image in grey, one byte a pixel. */
type Grey = { data: Uint8Array; width: number; height: number };

/** The least difference between the lightest and darkest pixel where text is that counts as ink (of 255). */
const INK = 64;

/** Whether a rect (CSS pixels) of a page image holds ink: pixels at least INK apart in lightness. */
function inked(grey: Grey, r: Run, scale: number): boolean {
  const left = Math.max(0, Math.floor(r.x * scale));
  const top = Math.max(0, Math.floor(r.y * scale));
  const right = Math.min(grey.width, Math.ceil((r.x + r.width) * scale));
  const bottom = Math.min(grey.height, Math.ceil((r.y + r.height) * scale));
  let lo = 255;
  let hi = 0;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const v = grey.data[y * grey.width + x];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return hi - lo >= INK;
}

/** Whether all of an element's text prints: it has text, and each line of it shows by CSS, lies inside the element and
 * leaves ink on the page image. */
function textPrinted(el: Pick<MeasuredElement, "x" | "y" | "width" | "height">, runs: Run[], grey: Grey, scale: number): boolean {
  const inside = (r: Run) => r.x >= el.x - 1 && r.y >= el.y - 1 && r.x + r.width <= el.x + el.width + 1 && r.y + r.height <= el.y + el.height + 1;
  return runs.length > 0 && runs.every((r) => r.css && r.width > 0 && r.height > 0 && inside(r) && inked(grey, r, scale));
}

/** Each sheet's top in the document, in CSS pixels. */
const SHEET_TOPS = `[...document.querySelectorAll("[data-sheet]")].map((s) => s.getBoundingClientRect().top + window.scrollY)`;

/** The text of the QR code in a page image, read in the area of a measured element and 0.25 inches around it. */
async function readQr(png: Uint8Array, at: MeasuredElement | undefined, scale: number): Promise<string | null> {
  if (!at) return null;
  const image = sharp(png);
  const { width = 0, height = 0 } = await image.metadata();
  const left = Math.max(0, Math.floor((at.x - 24) * scale));
  const top = Math.max(0, Math.floor((at.y - 24) * scale));
  const right = Math.min(width, Math.ceil((at.x + at.width + 24) * scale));
  const bottom = Math.min(height, Math.ceil((at.y + at.height + 24) * scale));
  if (right <= left || bottom <= top) return null;
  const { data, info } = await image.extract({ left, top, width: right - left, height: bottom - top }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
        const images = [];
        const measured: MeasuredElement[] = [];
        for (const [i, top] of tops.entries()) {
          const png = await page.screenshot({
            type: "png", captureBeyondViewport: true, clip: { x: 0, y: top, width: job.page.width, height: job.page.height },
          });
          const { data, info } = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
          const grey = { data, width: info.width, height: info.height };
          for (const { runs, ...m } of found.filter((m) => m.sheet === i)) measured.push({ ...m, textPrinted: textPrinted(m, runs, grey, job.scale) });
          const qr = measured.find((m) => m.sheet === i && m.name === "qr");
          images.push({ png, ...pngSize(png), qrText: await readQr(png, qr, job.scale) });
        }
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        return { pdf, pdfPages: pdfPageCount(pdf), images, measured };
      } finally {
        await browser.close();
      }
    },
  };
}
