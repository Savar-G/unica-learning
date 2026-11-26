// Reads the QR codes of a page image with jsqr, the reader that the scan side also uses. jsqr reads one code of a picture
// and takes about a tenth of a second for a whole page, so it gets only the small parts that can hold a code.
import jsQR from "jsqr";
import type { PageImage } from "./page-image";

/** A part of an image in whole pixels: the right and bottom ends are outside it. */
export interface Box { left: number; top: number; right: number; bottom: number }
export interface FoundQr { text: string; box: Box }

const DARK = 128;

export const isDark = ({ width, height, grey }: PageImage, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < width && y < height && grey[y * width + x] < DARK;

/** The QR code in a part of the image. Pixels outside the image or in `hidden` count as white. */
export function readQr(image: PageImage, box: Box, hidden: Box | null = null): FoundQr | null {
  const [width, height] = [box.right - box.left, box.bottom - box.top];
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = box.top; y < box.bottom; y++) {
    for (let x = box.left; x < box.right; x++) {
      if (x < 0 || y < 0 || x >= image.width || y >= image.height || (hidden && holds(hidden, x, y))) continue;
      pixels.fill(image.grey[y * image.width + x], ((y - box.top) * width + x - box.left) * 4, ((y - box.top) * width + x - box.left) * 4 + 3);
    }
  }
  const found = jsQR(pixels, width, height, { inversionAttempts: "dontInvert" });
  if (!found) return null;
  const { topLeftCorner: a, topRightCorner: b, bottomLeftCorner: c, bottomRightCorner: d } = found.location;
  const corners = [a, b, c, d];
  const [xs, ys] = [corners.map((p) => p.x + box.left), corners.map((p) => p.y + box.top)];
  return { text: found.data, box: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) } };
}

const holds = (b: Box, x: number, y: number) => x >= b.left && x < b.right && y >= b.top && y < b.bottom;

/** One of the three corner marks of a QR code: its centre and the size of one square. */
interface CornerMark { x: number; y: number; square: number }

/** Whether five lengths (dark, light, dark, light, dark) are near 1, 1, 3, 1 and 1 squares. */
function isCornerPattern(runs: readonly number[]): boolean {
  const square = runs.reduce((sum, n) => sum + n, 0) / 7;
  const room = square / 2 + 0.75;
  return runs.every((n, i) => Math.abs(n - (i === 2 ? 3 : 1) * square) < (i === 2 ? 3 : 1) * room);
}

/** The five lengths above and below a pixel, from the middle of a corner mark. */
function runsDown(dark: (y: number) => boolean, y: number): number[] {
  const walk = (step: number) => [true, false, true].map((wanted) => {
    let length = 0;
    while (dark(at + step) === wanted && length < MAX_RUN) {
      at += step;
      length++;
    }
    return length;
  });
  let at = y;
  const [up, upLight, upDark] = walk(-1);
  at = y;
  const [down, downLight, downDark] = walk(1);
  return [upDark, upLight, up + 1 + down, downLight, downDark];
}

/** Longer than three squares of the largest code that a page can hold. */
const MAX_RUN = 400;

const WHITE = 0xffffffff;

/** Whether each line can hold dark pixels. It looks at four pixels at a time, because most of a page is white. */
function linesWithInk({ width, height, grey }: PageImage): boolean[] {
  const lines = new Array<boolean>(height).fill(false);
  const start = Math.min((4 - (grey.byteOffset & 3)) & 3, grey.length);
  for (let i = 0; i < start; i++) if (grey[i] < DARK) lines[Math.floor(i / width)] = true;
  if (start === grey.length) return lines;
  const count = (grey.length - start) >> 2;
  const fours = new Uint32Array(grey.buffer, grey.byteOffset + start, count);
  for (let i = 0; i < count; i++) {
    if (fours[i] === WHITE) continue;
    const at = start + 4 * i;
    const last = Math.floor((at + 3) / width);
    for (let y = Math.floor(at / width); y <= last; y++) lines[y] = true;
  }
  for (let i = start + 4 * count; i < grey.length; i++) if (grey[i] < DARK) lines[Math.floor(i / width)] = true;
  return lines;
}

function cornerMarks(image: PageImage, hidden: Box): CornerMark[] {
  const marks: CornerMark[] = [];
  const dark = (x: number, y: number) => isDark(image, x, y) && !holds(hidden, x, y);
  const add = (x: number, y: number, runs: readonly number[]) => {
    const down = runsDown((at) => dark(x, at), y);
    if (!isCornerPattern(down)) return;
    const centre = y + Math.round((down[3] + down[4] - down[0] - down[1]) / 2);
    const square = [...runs, ...down].reduce((sum, n) => sum + n, 0) / 14;
    if (!marks.some((m) => Math.abs(m.x - x) < 2 * square && Math.abs(m.y - centre) < 3 * square)) marks.push({ x, y: centre, square });
  };
  const { width, height } = image;
  const inked = linesWithInk(image);
  for (let y = 0; y < height; y++) {
    if (!inked[y]) continue;
    const line = image.grey.subarray(y * width, (y + 1) * width);
    const [from, to] = y >= hidden.top && y < hidden.bottom ? [hidden.left, hidden.right] : [width, width];
    let runs = [0, 0, 0, 0, 0];
    let length = 0;
    let last = false;
    for (let x = 0; x <= width; x++) {
      const now = x < width && line[x] < DARK && (x < from || x >= to);
      if (now === last && x < width) {
        length++;
        continue;
      }
      runs = [runs[1], runs[2], runs[3], runs[4], length];
      if (last && isCornerPattern(runs)) add(Math.round(x - runs[4] - runs[3] - runs[2] / 2), y, runs);
      length = 1;
      last = now;
    }
  }
  return marks;
}

/** The other two corner marks of each code that can have this one in the middle: one beside it and one below or above. */
function partners(mark: CornerMark, marks: readonly CornerMark[]): [CornerMark, CornerMark][] {
  const room = 2 * mark.square;
  const least = 10 * mark.square;
  const beside = marks.filter((m) => Math.abs(m.y - mark.y) <= room && Math.abs(m.x - mark.x) >= least);
  const along = marks.filter((m) => Math.abs(m.x - mark.x) <= room && Math.abs(m.y - mark.y) >= least);
  return beside.flatMap((b) => along.filter((a) => Math.abs(Math.abs(b.x - mark.x) - Math.abs(a.y - mark.y)) <= room).map((a): [CornerMark, CornerMark] => [b, a]));
}

/** The texts of the QR codes outside one box. A code that is turned by a part of a quarter turn, or light on dark, is not found. */
export function strayQrTexts(image: PageImage, expected: Box): string[] {
  const marks = cornerMarks(image, expected);
  const texts = new Set<string>();
  for (const mark of marks) {
    for (const [beside, along] of partners(mark, marks)) {
      const edge = Math.ceil(5 * mark.square);
      const box = {
        left: Math.min(mark.x, beside.x) - edge, top: Math.min(mark.y, along.y) - edge,
        right: Math.max(mark.x, beside.x) + edge, bottom: Math.max(mark.y, along.y) + edge,
      };
      const found = readQr(image, box, expected);
      if (found) texts.add(found.text);
    }
  }
  return [...texts];
}
