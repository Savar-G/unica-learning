import type { MeasuredElement, PrintEngine, PrintJob } from "@/lib/workbook-render";

// A print engine for tests (#309): it reads the document as Chromium would only as far as the renderer needs. It finds
// each sheet and each element marked with data-measure, in document order, with the element's own text, and gives
// every marked element a rect: a sheet fills its page; any other element is at (48, 48), 200 by 100 CSS pixels, unless
// the test gives a rect. An element fits its space unless the test names it as overflowing. Elements are named
// "<sheet from 1> <data-measure>", so "2 question-3" is question 3 on the second sheet. It records the jobs it prints.
// The PDF and images are placeholder bytes of the right count and size.

type Rect = Pick<MeasuredElement, "x" | "y" | "width" | "height">;

export function fakePrintEngine(o: { rects?: Record<string, Rect>; overflow?: string[] } = {}): PrintEngine & { jobs: PrintJob[] } {
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
          const rect = o.rects?.[key] ?? (name === "sheet" ? { x: 0, y: 0, ...job.page } : { x: 48, y: 48, width: 200, height: 100 });
          const over = o.overflow?.includes(key) ? 40 : 0;
          return {
            sheet, name, text: text.trim(), ...rect,
            clientWidth: rect.width, clientHeight: rect.height, scrollWidth: rect.width, scrollHeight: rect.height + over,
          };
        });
      });
      const width = Math.round(job.page.width * job.scale);
      const height = Math.round(job.page.height * job.scale);
      return {
        pdf: new TextEncoder().encode("%PDF-fake"),
        images: sheets.map((_, i) => ({ png: new TextEncoder().encode(`png-${i + 1}`), width, height })),
        measured,
      };
    },
  };
}
