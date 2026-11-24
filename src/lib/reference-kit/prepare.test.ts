import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  createEmptyManifest,
  formatTooSmallReason,
  isPhotoTooSmall,
  isSupportedPhotoFile,
  MIN_LONG_SIDE_PX,
  MIN_SHORT_SIDE_PX,
  parsePhotosManifest,
  PHOTOS_MANIFEST_FILE,
  preparedFileNameForHash,
  preparePhoto,
  readRegularFileNoFollow,
  resolveSafeChildPath,
  sha256Hex,
  upsertManifestPhoto,
} from "./prepare";

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

async function makeTestImage(opts: {
  width: number;
  height: number;
  format?: "jpeg" | "png" | "webp";
  orientation?: number;
  withIcc?: boolean;
  withExif?: boolean;
}): Promise<Buffer> {
  let pipeline = sharp({
    create: {
      width: opts.width,
      height: opts.height,
      channels: 3,
      background: { r: 220, g: 230, b: 240 },
    },
  });
  if (opts.withExif) {
    pipeline = pipeline.withExif({
      IFD0: {
        Make: "TestCam",
        ImageDescription: "Private camera note",
      },
    });
  }
  if (opts.orientation) {
    pipeline = pipeline.withMetadata({ orientation: opts.orientation });
  }
  if (opts.withIcc) {
    pipeline = pipeline.withIccProfile("srgb");
  }
  const fmt = opts.format ?? "jpeg";
  if (fmt === "png") return pipeline.png().toBuffer();
  if (fmt === "webp") return pipeline.webp().toBuffer();
  return pipeline.jpeg({ quality: 92 }).toBuffer();
}

describe("preparePhoto and prepare helpers", () => {
  it("applies EXIF rotation, converts to JPEG 4:4:4 quality 90, strips all metadata, and keeps full dimensions", async () => {
    // 1800x1200 with EXIF orientation 6 (90 deg CW) -> after rotation must be 1200x1800
    const raw = await makeTestImage({
      width: 1800,
      height: 1200,
      format: "jpeg",
      orientation: 6,
      withExif: true,
      withIcc: true,
    });
    const rawMeta = await sharp(raw).metadata();
    expect(rawMeta.orientation).toBe(6);
    expect(rawMeta.exif).toBeDefined();
    expect(rawMeta.icc).toBeDefined();

    const prepared = await preparePhoto(raw);
    expect(prepared.width).toBe(1200);
    expect(prepared.height).toBe(1800);
    expect(prepared.sha256).toBe(sha256Hex(prepared.bytes));
    expect(preparedFileNameForHash(prepared.sha256)).toBe(`${prepared.sha256.slice(0, 12)}.jpg`);

    const outMeta = await sharp(prepared.bytes).metadata();
    expect(outMeta.format).toBe("jpeg");
    expect(outMeta.width).toBe(1200);
    expect(outMeta.height).toBe(1800);
    expect(outMeta.chromaSubsampling).toBe("4:4:4");
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.icc).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
    expect(outMeta.iptc).toBeUndefined();
    expect(outMeta.orientation).toBeUndefined();
  });

  it("decodes PNG and WebP inputs without cropping or resizing", async () => {
    const pngBytes = await makeTestImage({ width: 1600, height: 1000, format: "png", withIcc: true });
    const pngPrep = await preparePhoto(pngBytes);
    expect(pngPrep.width).toBe(1600);
    expect(pngPrep.height).toBe(1000);
    expect((await sharp(pngPrep.bytes).metadata()).format).toBe("jpeg");
    expect((await sharp(pngPrep.bytes).metadata()).icc).toBeUndefined();

    const webpBytes = await makeTestImage({ width: 1000, height: 1700, format: "webp" });
    const webpPrep = await preparePhoto(webpBytes);
    expect(webpPrep.width).toBe(1000);
    expect(webpPrep.height).toBe(1700);
    expect((await sharp(webpPrep.bytes).metadata()).format).toBe("jpeg");
  });

  it("rejects unreadable non-image bytes", async () => {
    await expect(preparePhoto(Buffer.from("not an image at all"))).rejects.toThrow();
  });

  it("accepts only supported photo extensions and ignores dotfiles", () => {
    expect(MIN_LONG_SIDE_PX).toBe(1600);
    expect(MIN_SHORT_SIDE_PX).toBe(600);
    expect(isPhotoTooSmall(1600, 600)).toBe(false);
    expect(isPhotoTooSmall(600, 1600)).toBe(false);
    expect(isPhotoTooSmall(1599, 600)).toBe(true);
    expect(isPhotoTooSmall(461, 3473)).toBe(true);
    expect(isPhotoTooSmall(3473, 599)).toBe(true);
    expect(isPhotoTooSmall(800, 600)).toBe(true);
    expect(formatTooSmallReason(461, 3473)).toBe(
      "too_small (461x3473): need at least 1600 px on the long side and 600 px on the short side",
    );
    expect(PHOTOS_MANIFEST_FILE).toBe("photos-manifest.json");
    for (const name of ["a.jpg", "b.JPEG", "c.png", "d.webp", "e.heic", "f.HEIF"]) {
      expect(isSupportedPhotoFile(name)).toBe(true);
    }
    for (const bad of [".IMG_0001.jpg", "notes.txt", "scan.pdf", "img.gif", "page.tif", ""]) {
      expect(isSupportedPhotoFile(bad)).toBe(false);
    }
  });

  it("reads regular files without following symlinks and rejects directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "ref-prep-"));
    tempDirs.push(dir);
    const target = join(dir, "real.jpg");
    const link = join(dir, "link.jpg");
    const sub = join(dir, "sub");
    writeFileSync(target, Buffer.from([1, 2, 3]));
    symlinkSync(target, link);
    mkdirSync(sub);

    expect(readRegularFileNoFollow(target)).toEqual(Buffer.from([1, 2, 3]));
    expect(() => readRegularFileNoFollow(link)).toThrow(/symlink/i);
    expect(() => readRegularFileNoFollow(sub)).toThrow(/non-regular|directory/i);
  });

  it("validates photos-manifest.json shape and upserts entries preserving source_ref unless cleared", () => {
    const sha = "a".repeat(64);
    const file = preparedFileNameForHash(sha);
    let manifest = createEmptyManifest();
    manifest = upsertManifestPhoto(manifest, {
      file,
      sha256: sha,
      original_name: "IMG_0001.jpg",
      width: 3024,
      height: 4032,
      source_ref: "sample:M:3a",
    });

    const parsed = parsePhotosManifest(JSON.parse(JSON.stringify(manifest)) as unknown);
    expect(parsed).toEqual({
      version: 1,
      photos: [
        {
          file: "aaaaaaaaaaaa.jpg",
          sha256: sha,
          original_name: "IMG_0001.jpg",
          width: 3024,
          height: 4032,
          source_ref: "sample:M:3a",
        },
      ],
    });

    expect(() => parsePhotosManifest({ version: 2, photos: [] })).toThrow(/manifest/i);
    expect(() =>
      parsePhotosManifest({
        version: 1,
        photos: [{ file: "../escape.jpg", sha256: sha, original_name: "a.jpg", width: 1600, height: 1600 }],
      }),
    ).toThrow(/file/i);
    expect(resolveSafeChildPath("/tmp/x", "a.jpg")).toBe("/tmp/x/a.jpg");
    expect(resolveSafeChildPath("/tmp/x", "../a.jpg")).toBeNull();
  });
});
