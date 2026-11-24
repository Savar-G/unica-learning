import { cropBox, cropInPhoto, type Calibration, type Raster } from "@/lib/scan-calibration";
import type { Box, PagePrintContract } from "@/lib/workbook-print-contract";

/** Trim only the extension. The existing printed-box cut-off check runs separately. */
export function limitReachToPhoto(calibration: Calibration, contract: PagePrintContract, box: Box, reach: Box): Box {
  const visible = (area: Box) => cropInPhoto(calibration, contract, area, true);
  if (visible(reach)) return reach;
  let low = 0, high = 1, best = box;
  for (let i = 0; i < 8; i++) {
    const share = (low + high) / 2;
    const area = {
      x: box.x + (reach.x - box.x) * share,
      y: box.y + (reach.y - box.y) * share,
      width: box.width + (reach.width - box.width) * share,
      height: box.height + (reach.height - box.height) * share,
    };
    if (visible(area)) { low = share; best = area; }
    else high = share;
  }
  return best;
}

export function enclosingBox(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, width: Math.max(...boxes.map(b => b.x + b.width)) - x, height: Math.max(...boxes.map(b => b.y + b.height)) - y };
}

/** One preview file per question, with the gaps between its individual regions masked. */
export function renderAnswerCrop(photo: Raster, calibration: Calibration, contract: PagePrintContract, printedBox: Box, display?: { box: Box; areas: readonly Box[] }): Raster {
  const raster = cropBox(photo, calibration, contract, printedBox, display?.box);
  if (!display || display.areas.length === 1) return raster;
  const { box, areas } = display;
  for (let row = 0; row < raster.height; row++) {
    const y = box.y + (row + 0.5) * box.height / raster.height;
    const spans = areas.filter(a => y >= a.y && y < a.y + a.height);
    for (let col = 0; col < raster.width; col++) {
      const x = box.x + (col + 0.5) * box.width / raster.width;
      if (spans.some(a => x >= a.x && x < a.x + a.width)) continue;
      const offset = (row * raster.width + col) * raster.channels;
      raster.data.fill(255, offset, offset + raster.channels);
    }
  }
  return raster;
}
