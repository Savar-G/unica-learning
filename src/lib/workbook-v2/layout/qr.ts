// A QR code as black squares in a fixed box. The box holds the quiet zone, so nothing else may print in it.
import QRCode from "qrcode";
import { PRINT_RULES, SCAN_QR_QUIET_MODULES as QUIET, type Ink, type Rect } from "../contract";

/** The squares, joined along each line of the code, or why there is no code. */
export function qrSquares(box: Rect, text: string): Ink[] | string {
  if (text === "") return "the QR code has no text";
  let modules: ReturnType<typeof QRCode.create>["modules"];
  try {
    modules = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  } catch {
    return `no QR code can hold a text of ${text.length} characters`;
  }
  const size = box.w / (modules.size + 2 * QUIET);
  if (size < PRINT_RULES.qrModuleMin) return `the QR code for a text of ${text.length} characters needs squares that are too small to scan`;
  const ink: Ink[] = [];
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      const start = col;
      while (col + 1 < modules.size && modules.get(row, col + 1)) col++;
      ink.push({ kind: "fill", color: "black", rect: { x: box.x + (QUIET + start) * size, y: box.y + (QUIET + row) * size, w: (col - start + 1) * size, h: size } });
    }
  }
  return ink;
}
