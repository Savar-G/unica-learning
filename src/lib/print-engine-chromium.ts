// The print engine (#309): headless Chromium through puppeteer-core, used only to lay out and print workbook pages
// (the Aside rule in AGENTS.md covers browser checks, not this). One browser per print job: it loads the document with
// print styles, waits for its fonts, measures every [data-measure] element against its sheet, prints the PDF and takes
// one PNG of each sheet at the job's scale.
//
// Which Chromium: CHROMIUM_PATH when set; on Linux (a Vercel function) the serverless build @sparticuz/chromium; on a
// Mac, the installed Google Chrome or Chromium. Server only: no Next.js.
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
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

// Runs in the page: each sheet, then each marked element in it, measured from the sheet's top left corner. A string,
// so no build step can rename or wrap what runs in the browser.
const MEASURE = `[...document.querySelectorAll("[data-sheet]")].flatMap((sheet, i) => {
  const origin = sheet.getBoundingClientRect();
  return [sheet, ...sheet.querySelectorAll("[data-measure]")].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      sheet: i, name: el.getAttribute("data-measure"), text: (el.textContent || "").trim().slice(0, 200),
      x: r.left - origin.left, y: r.top - origin.top, width: r.width, height: r.height,
      clientWidth: el.clientWidth, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, scrollHeight: el.scrollHeight,
    };
  });
})`;

/** Each sheet's top in the document, in CSS pixels. */
const SHEET_TOPS = `[...document.querySelectorAll("[data-sheet]")].map((s) => s.getBoundingClientRect().top + window.scrollY)`;

/** A PNG's size from its header. */
function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

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
        const measured = await page.evaluate(MEASURE) as MeasuredElement[];
        const tops = await page.evaluate(SHEET_TOPS) as number[];
        if (tops.length !== job.sheets) throw new Error(`print engine: ${tops.length} sheets for ${job.sheets}`);
        const images = [];
        for (const top of tops) {
          const png = await page.screenshot({
            type: "png", captureBeyondViewport: true, clip: { x: 0, y: top, width: job.page.width, height: job.page.height },
          });
          images.push({ png, ...pngSize(png) });
        }
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        return { pdf, images, measured };
      } finally {
        await browser.close();
      }
    },
  };
}
