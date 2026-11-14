import { describe, it, expect } from "vitest";
import sharp from "sharp";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { blankPage, drawPrintedContent, drawQr, photographed, rasterSharp, uprightCorners } from "./scan-synthetic";
import { normalizeScanPhoto, readScanBody } from "./scan-photo-image";

const token = "syntheticScanPage454Token";
async function page(url = `https://unicalearning.com/tutor/p/${token}`) {
  return QRCode.toBuffer(url, { width: 600, margin: 4 });
}

describe("scan photo normalization", () => {
  it("reads the actual QR, strips EXIF and rotates pixels to their display orientation", async () => {
    const original = await sharp(await page()).rotate(90).withMetadata({ orientation: 8 }).jpeg().toBuffer();
    const result = await normalizeScanPhoto(original);
    expect(result.token).toBe(token);
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(result.width).toBe(600);
  });
  it("refuses arbitrary bytes, excessive input and actual decoded pixel counts before persistence", async () => {
    await expect(normalizeScanPhoto(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    const image = await page();
    await expect(normalizeScanPhoto(image, { inputBytes: image.length - 1, pixels: 48_000_000, outputBytes: 200000 })).rejects.toThrow("size");
    await expect(normalizeScanPhoto(image, { inputBytes: 200000, pixels: 359999, outputBytes: 200000 })).rejects.toThrow();
    await expect(normalizeScanPhoto(image, { inputBytes: 200000, pixels: 360000, outputBytes: 1 })).rejects.toThrow("size");
  });
  it("asks for a retake for absent QR, another host and forged page paths", async () => {
    const blank = await sharp({ create: { width: 300, height: 300, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeScanPhoto(blank)).rejects.toThrow("qr");
    for (const url of [`https://other.example/tutor/p/${token}`, `https://unicalearning.com/tutor/p/${token}?other=1`, "https://unicalearning.com/account"]) {
      await expect(normalizeScanPhoto(await page(url))).rejects.toThrow("qr");
    }
  });
  it("reads a small code that the whole photo's read misses, in a zoomed crop, and still refuses another host's (#912)", async () => {
    // A soft photo of a sheet with a small code low on the left, as a phone takes it.
    const photo = async (url: string) => {
      const sheet = blankPage(1275, 1650);
      drawPrintedContent(sheet);
      drawQr(sheet, { x: 90, y: 1513, width: 87, height: 87 }, url);
      const raster = photographed(sheet, { width: 1500, height: 1900 }, uprightCorners({ width: 1500, height: 1900 }, { width: 1275, height: 1650 }, 60), { shade: 0.2 });
      return rasterSharp(raster).blur(1).jpeg({ quality: 82 }).toBuffer();
    };
    const bytes = await photo(`https://unicalearning.com/tutor/p/${token}`);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: "attemptBoth" })).toBeNull();
    expect((await normalizeScanPhoto(bytes)).token).toBe(token);
    await expect(normalizeScanPhoto(await photo(`https://other.example/tutor/p/${token}`))).rejects.toThrow("qr");
  });
  it("bounds streamed bytes without trusting content length", async () => {
    const request = () => new Request("https://test.invalid", { method: "PUT", body: new Uint8Array(20), headers: { "Content-Length": "1" } });
    await expect(readScanBody(request(), 19)).rejects.toThrow("size");
    expect((await readScanBody(request(), 20)).length).toBe(20);
  });
});
