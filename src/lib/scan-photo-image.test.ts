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
  it("splits an open book's two pages into two page photos, each with only its own code, and leaves one page alone (#915)", async () => {
    // A sheet whose code sits where the template prints it: a 0.0572-wide symbol centred 0.114 from the left edge.
    const sheet = (name: string) => {
      const page = blankPage(1275, 1650);
      drawPrintedContent(page);
      const symbol = 73, size = QRCode.create(`https://unicalearning.com/tutor/p/${name}`, { errorCorrectionLevel: "M" }).modules.size, box = (symbol * (size + 8)) / size;
      drawQr(page, { x: 145 - box / 2, y: 1505 - box / 2, width: box, height: box }, `https://unicalearning.com/tutor/p/${name}`);
      return page;
    };
    const place = (x: number) => [{ x, y: 80 }, { x: x + 1180, y: 80 }, { x: x + 1180, y: 80 + 1527 }, { x, y: 80 + 1527 }];
    const photo = photographed(sheet("spreadLeftPage0001"), { width: 2600, height: 1700 }, place(90), { background: 200 });
    photographed(sheet("spreadRightPage002"), { width: 2600, height: 1700 }, place(1310), { onto: photo });
    const spread = await normalizeScanPhoto(await rasterSharp(photo).jpeg({ quality: 90 }).toBuffer());
    expect(spread.spread?.map((p) => p.token)).toEqual(["spreadLeftPage0001", "spreadRightPage002"]);
    // Each page photo shows one code: read again, it is that page and no spread.
    for (const [i, page] of spread.spread!.entries()) {
      const again = await normalizeScanPhoto(page.bytes);
      expect(again.token).toBe(["spreadLeftPage0001", "spreadRightPage002"][i]);
      expect(again.spread).toBeNull();
    }
    // One page alone, and a sheet lying a little off another (not a page width away), are not spreads.
    const single = photographed(sheet("spreadLeftPage0001"), { width: 1400, height: 1700 }, place(110), { background: 200 });
    expect((await normalizeScanPhoto(await rasterSharp(single).jpeg({ quality: 90 }).toBuffer())).spread).toBeNull();
    const stacked = photographed(sheet("spreadRightPage002"), { width: 2000, height: 1700 }, place(90), { background: 200 });
    photographed(sheet("spreadLeftPage0001"), { width: 2000, height: 1700 }, place(600), { onto: stacked });
    expect((await normalizeScanPhoto(await rasterSharp(stacked).jpeg({ quality: 90 }).toBuffer())).spread).toBeNull();
  });
  it("takes a sliver of the next page as a photo of one page, and refuses pages turned at the spine (#965 review)", async () => {
    const sheet = (name: string) => {
      const page = blankPage(1275, 1650);
      drawPrintedContent(page);
      const symbol = 73, size = QRCode.create(`https://unicalearning.com/tutor/p/${name}`, { errorCorrectionLevel: "M" }).modules.size, box = (symbol * (size + 8)) / size;
      drawQr(page, { x: 145 - box / 2, y: 1505 - box / 2, width: box, height: box }, `https://unicalearning.com/tutor/p/${name}`);
      return page;
    };
    const place = (x: number) => [{ x, y: 80 }, { x: x + 1180, y: 80 }, { x: x + 1180, y: 80 + 1527 }, { x, y: 80 + 1527 }];
    // The left page whole and a quarter of the right page, its code in view: one photo, of the left page.
    const sliver = photographed(sheet("spreadLeftPage0001"), { width: 1610, height: 1700 }, place(90), { background: 200 });
    photographed(sheet("spreadRightPage002"), { width: 1610, height: 1700 }, place(1310), { onto: sliver });
    const one = await normalizeScanPhoto(await rasterSharp(sliver).jpeg({ quality: 90 }).toBuffer());
    expect(one.spread).toBeNull();
    expect(one.token).toBe("spreadLeftPage0001");
    // The right page turned 8 degrees about its foot at the spine: its top reaches over the cut, so the photo is refused.
    const turn = (corners: { x: number; y: number }[], about: { x: number; y: number }, degrees: number) => {
      const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      return corners.map((p) => ({ x: about.x + (p.x - about.x) * c - (p.y - about.y) * s, y: about.y + (p.x - about.x) * s + (p.y - about.y) * c }));
    };
    const turned = photographed(sheet("spreadLeftPage0001"), { width: 2600, height: 1700 }, place(90), { background: 200 });
    photographed(sheet("spreadRightPage002"), { width: 2600, height: 1700 }, turn(place(1310), { x: 1310, y: 1607 }, -8), { onto: turned });
    await expect(normalizeScanPhoto(await rasterSharp(turned).jpeg({ quality: 90 }).toBuffer())).rejects.toThrow("flat");
  });
  it("bounds streamed bytes without trusting content length", async () => {
    const request = () => new Request("https://test.invalid", { method: "PUT", body: new Uint8Array(20), headers: { "Content-Length": "1" } });
    await expect(readScanBody(request(), 19)).rejects.toThrow("size");
    expect((await readScanBody(request(), 20)).length).toBe(20);
  });
});
