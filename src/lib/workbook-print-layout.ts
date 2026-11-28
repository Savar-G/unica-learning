import type { Box, PrintedCapture } from "@/lib/workbook-print-contract";
import { SCAN_LAYOUTS, V2_SCAN_LAYOUT_VERSION, pagePixels, type Capture, type Rect, type ScanLayoutId } from "@/lib/workbook-v2/contract";

export function isScanLayout(v: unknown): v is ScanLayoutId {
  return !!v && typeof v === "object" && "version" in v && v.version === V2_SCAN_LAYOUT_VERSION
    && "side" in v && (v.side === "front" || v.side === "back");
}

export function scanLayoutPixels(layout: ScanLayoutId, image: { width: number; height: number }) {
  const { paper, marks, markStroke, qr } = SCAN_LAYOUTS[layout.version][layout.side];
  return {
    qr: pagePixels(qr, paper, image),
    marks: Object.values(marks).map((mark) => pagePixels(mark, paper, image)),
    stroke: markStroke * image.width / paper.w,
  };
}

/** Convert a model rectangle to the stored precision in the page image's coordinates. */
export function printedPixels(rect: Rect, paper: { w: number; h: number }, image: { width: number; height: number }): Box {
  const { x, y, width, height } = pagePixels(rect, paper, image);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function printedCapture({ id, kind, rect, fields }: Capture, paper: { w: number; h: number }, image: { width: number; height: number }): PrintedCapture {
  return { id, kind, box: printedPixels(rect, paper, image),
    fields: fields.map((f) => ({ name: f.name, box: printedPixels(f.rect, paper, image), reach: printedPixels(f.reach, paper, image) })) };
}
