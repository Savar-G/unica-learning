// Sample-only adapter. The bundler substitutes this import in the production print engine.
// The production engine, its QR reader and its ink checks stay unchanged.
import puppeteer, { type Browser, type Page } from "puppeteer-core";

export const browserStats = { launches: 0, pagesCreated: 0, documents: 0, screenshots: 0, pdfs: 0, screenshotMs: 0, pdfMs: 0 };
let running: Promise<Browser> | undefined;
const idle: Page[] = [];

function instrument(page: Page) {
  const screenshot = page.screenshot.bind(page);
  page.screenshot = (async (options: Parameters<Page["screenshot"]>[0]) => {
    const start = performance.now();
    browserStats.screenshots++;
    try { return await screenshot({ ...options, optimizeForSpeed: true }); }
    finally { browserStats.screenshotMs += performance.now() - start; }
  }) as Page["screenshot"];
  const pdf = page.pdf.bind(page);
  page.pdf = async options => {
    const start = performance.now();
    browserStats.pdfs++;
    // The engine already awaited document.fonts.ready before measurement and screenshots.
    try { return await pdf({ ...options, waitForFonts: false }); }
    finally { browserStats.pdfMs += performance.now() - start; }
  };
  return page;
}

export async function closeSampleBrowser() {
  const browser = running;
  running = undefined;
  idle.length = 0;
  if (browser) await (await browser).close();
}

export default {
  async launch(options: Parameters<typeof puppeteer.launch>[0]): Promise<Pick<Browser, "newPage" | "close">> {
    running ??= (async () => {
      browserStats.launches++;
      return puppeteer.launch(options);
    })().catch(error => { running = undefined; throw error; });
    const browser = await running;
    const leased: Page[] = [];
    // The production engine closes this lease in its finally block. The real browser
    // stays open until the sample run ends. Each concurrent print owns its page.
    return {
      async newPage() {
        browserStats.documents++;
        let page = idle.pop();
        if (!page) { browserStats.pagesCreated++; page = instrument(await browser.newPage()); }
        leased.push(page);
        return page;
      },
      async close() {
        for (const page of leased) {
          if (!page.isClosed()) idle.push(page);
        }
      },
    };
  },
};
