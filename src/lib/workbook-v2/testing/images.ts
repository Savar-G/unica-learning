// Reads a page image for tests.
import jsQR from "jsqr";
import sharp from "sharp";
import type { Rect } from "../contract";

const PIXELS_PER_POINT = 150 / 72;

export interface PageImage { width: number; height: number; data: Uint8ClampedArray }

export async function readImage(png: Uint8Array): Promise<PageImage> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

export const qrText = (image: PageImage): string | null => jsQR(image.data, image.width, image.height)?.data ?? null;

/** Whether every pixel is a grey, from black to white, and none is see-through. */
export function isGrey({ data }: PageImage): boolean {
  for (let i = 0; i < data.length; i += 4) if (data[i] !== data[i + 1] || data[i] !== data[i + 2] || data[i + 3] !== 255) return false;
  return true;
}

/** The darkest pixel in a rectangle given in points: 0 is black, 255 is paper white. */
export function darkest(image: PageImage, rect: Rect): number {
  let found = 255;
  const [left, top] = [Math.ceil(rect.x * PIXELS_PER_POINT), Math.ceil(rect.y * PIXELS_PER_POINT)];
  const [right, bottom] = [Math.floor((rect.x + rect.w) * PIXELS_PER_POINT), Math.floor((rect.y + rect.h) * PIXELS_PER_POINT)];
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) found = Math.min(found, image.data[(y * image.width + x) * 4]);
  return found;
}
