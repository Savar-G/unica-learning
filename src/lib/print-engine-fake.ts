import type { MeasuredElement, PrintEngine, PrintJob } from "@/lib/workbook-render";

// A print engine for tests (#309): it reads the document as Chromium would only as far as the renderer needs. It finds
// each sheet and each element marked with data-measure, in document order, with the element's own text, and gives
// every marked element a rect: a sheet fills its page; a question's content fills the top 30% of the question and its
// answer space and other regions (region-<n>-<id>) the rest; any other element is at (48, 48), 200 by 100 CSS pixels,
// unless the test gives a rect. An element fits its space and
// shows unless the test names it as overflowing or hidden, and its text prints unless the test names it as blank.
// Elements are named "<sheet from 1> <data-measure>", so "2 question-3" is question 3 on the second sheet. A page's QR
// code reads as the link the renderer drew (the fake reads data-qr-link instead of the image), unless `qrText` gives
// another text or null. It records the jobs it prints.
// The PDF and images are placeholder bytes of the right count and size; `pdfPages` gives the PDF another page count.

/** The link of the QR code the renderer drew in a sheet, or null when the sheet's QR element is not the renderer's. */
const drawnLink = (sheet: string) => /data-measure="qr" data-qr-link="([^"]+)"><svg/.exec(sheet)?.[1] ?? null;

type Rect = Pick<MeasuredElement, "x" | "y" | "width" | "height">;
const DEFAULT: Rect = { x: 48, y: 48, width: 200, height: 100 };

export function fakePrintEngine(o: {
  rects?: Record<string, Rect>; overflow?: string[]; hidden?: string[]; blank?: string[]; qrText?: Record<number, string | null>; pdfPages?: number;
} = {}): PrintEngine & { jobs: PrintJob[] } {
  const jobs: PrintJob[] = [];
  return {
    jobs,
    async print(job) {
      jobs.push(job);
      const sheets = job.html.split(/<section data-sheet="\d+"/).slice(1);
      if (sheets.length !== job.sheets) throw new Error(`fake print engine: ${sheets.length} sheets for ${job.sheets}`);
      const measured = sheets.flatMap((html, sheet) => {
        // The sheet itself, then each marked element inside it: the split left the sheet's own attributes first.
        const marks = [...html.matchAll(/data-measure="([^"]+)"[^>]*>([^<]*)/g)];
        return marks.map(([, name, text]): MeasuredElement => {
          const key = `${sheet + 1} ${name}`;
          // A question's content takes the top 30% of the question's rect; its answer space and other regions the rest,
          // so a box does not cover its own text unless a test says so.
          const part = /^question-(\d+)-(content|answer)$/.exec(name) ?? /^region-(\d+)-()/.exec(name);
          const of = part ? o.rects?.[`${sheet + 1} question-${part[1]}`] ?? DEFAULT : undefined;
          const rect = o.rects?.[key]
            ?? (of && part![2] === "content" ? { ...of, height: of.height * 0.3 } : undefined)
            ?? (of ? { ...of, y: of.y + of.height * 0.3, height: of.height * 0.7 } : undefined)
            ?? (name === "sheet" ? { x: 0, y: 0, ...job.page } : DEFAULT);
          const over = o.overflow?.includes(key) ? 40 : 0;
          return {
            sheet, name, text: text.trim(), visible: !o.hidden?.includes(key), textPrinted: !o.blank?.includes(key), ...rect,
            clientWidth: rect.width, clientHeight: rect.height, scrollWidth: rect.width, scrollHeight: rect.height + over,
          };
        });
      });
      const width = Math.round(job.page.width * job.scale);
      const height = Math.round(job.page.height * job.scale);
      return {
        pdf: new TextEncoder().encode("%PDF-fake"),
        pdfPages: o.pdfPages ?? sheets.length,
        images: sheets.map((html, i) => ({
          png: new TextEncoder().encode(`png-${i + 1}`), width, height,
          qrText: o.qrText && i + 1 in o.qrText ? o.qrText[i + 1] : drawnLink(html),
        })),
        measured,
      };
    },
  };
}
