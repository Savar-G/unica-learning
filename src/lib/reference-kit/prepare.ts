import { createHash } from "node:crypto";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import sharp from "sharp";

export const PHOTOS_MANIFEST_FILE = "photos-manifest.json";
export const PREPARE_REPORT_FILE = "prepare.json";
export const MIN_LONG_SIDE_PX = 1600;
export const MIN_SHORT_SIDE_PX = 600;

export function isPhotoTooSmall(width: number, height: number): boolean {
  return Math.max(width, height) < MIN_LONG_SIDE_PX || Math.min(width, height) < MIN_SHORT_SIDE_PX;
}

export function formatTooSmallReason(width: number, height: number): string {
  return `too_small (${width}x${height}): need at least ${MIN_LONG_SIDE_PX} px on the long side and ${MIN_SHORT_SIDE_PX} px on the short side`;
}

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const PREPARED_FILE_RE = /^([0-9a-f]{12})\.jpg$/;

const SUPPORTED_PHOTO_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
]);

export interface PreparedPhoto {
  bytes: Buffer;
  width: number;
  height: number;
  sha256: string;
}

export interface PhotosManifestEntry {
  file: string;
  sha256: string;
  original_name: string;
  width: number;
  height: number;
  source_ref?: string;
}

export interface PhotosManifest {
  version: 1;
  photos: PhotosManifestEntry[];
}

export interface TooSmallPhotoReport {
  original_name: string;
  width: number;
  height: number;
}

export interface UnreadablePhotoReport {
  original_name: string;
  reason: string;
}

export interface DuplicatePhotoReport {
  original_name: string;
  duplicate_of: string;
  photo_sha256: string;
}

export interface RemovedPhotoReport {
  original_name: string;
  photo: string;
  photo_sha256: string;
  source_ref?: string;
  kept_human_checked: boolean;
}

export interface PrepareReportFile {
  version: 1;
  too_small: TooSmallPhotoReport[];
  unreadable: UnreadablePhotoReport[];
  duplicates?: DuplicatePhotoReport[];
  removed_photos?: RemovedPhotoReport[];
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isSupportedPhotoFile(filename: string): boolean {
  if (!filename || filename.startsWith(".")) return false;
  return SUPPORTED_PHOTO_EXTENSIONS.has(extname(filename).toLowerCase());
}

export function preparedFileNameForHash(sha256: string): string {
  return `${sha256.slice(0, 12)}.jpg`;
}

export function isValidPreparedFileName(file: string, sha256: string): boolean {
  if (!SHA256_HEX_RE.test(sha256)) return false;
  const match = PREPARED_FILE_RE.exec(file);
  if (!match) return false;
  return sha256.startsWith(match[1]);
}

export function readRegularFileNoFollow(filePath: string): Buffer {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
  let fd: number;
  try {
    fd = openSync(filePath, constants.O_RDONLY | noFollow);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") {
      throw new Error(`Refusing to read symlink: ${filePath}`);
    }
    throw err;
  }

  try {
    const st = fstatSync(fd);
    if (!st.isFile()) {
      throw new Error(`Refusing to read non-regular file: ${filePath}`);
    }
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

export function resolveSafeChildPath(dir: string, filename: string): string | null {
  if (
    !filename ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    return null;
  }
  const absDir = resolve(dir);
  const candidate = resolve(absDir, filename);
  const rel = relative(absDir, candidate);
  if (!rel || isAbsolute(rel) || rel.startsWith("..") || rel.includes("/") || rel.includes("\\")) {
    return null;
  }
  return candidate;
}

/**
 * Applies EXIF rotation, converts to JPEG (quality 90, 4:4:4 chroma subsampling),
 * strips all metadata (EXIF, GPS, ICC, XMP, embedded thumbnail), with no crop and no resize.
 */
export async function preparePhoto(bytes: Buffer | Uint8Array): Promise<PreparedPhoto> {
  const { data, info } = await sharp(bytes)
    .rotate()
    .jpeg({ quality: 90, chromaSubsampling: "4:4:4" })
    .toBuffer({ resolveWithObject: true });

  return {
    bytes: data,
    width: info.width,
    height: info.height,
    sha256: sha256Hex(data),
  };
}

export function createEmptyManifest(): PhotosManifest {
  return { version: 1, photos: [] };
}

export function parsePhotosManifest(raw: unknown): PhotosManifest {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Invalid photos manifest: expected an object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1 || !Array.isArray(obj.photos)) {
    throw new Error("Invalid photos manifest: expected version 1 with a photos array");
  }
  const photos: PhotosManifestEntry[] = obj.photos.map((entry, idx) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`Invalid manifest photo entry at index ${idx}`);
    }
    const e = entry as Record<string, unknown>;
    if (
      typeof e.file !== "string" ||
      typeof e.sha256 !== "string" ||
      typeof e.original_name !== "string" ||
      typeof e.width !== "number" ||
      !Number.isInteger(e.width) ||
      e.width <= 0 ||
      typeof e.height !== "number" ||
      !Number.isInteger(e.height) ||
      e.height <= 0
    ) {
      throw new Error(`Invalid manifest fields at index ${idx}`);
    }
    if (!isValidPreparedFileName(e.file, e.sha256)) {
      throw new Error(
        `Invalid prepared photo file name at index ${idx}: "${e.file}" must match <first 12 hex of sha256>.jpg`,
      );
    }
    const parsed: PhotosManifestEntry = {
      file: e.file,
      sha256: e.sha256,
      original_name: e.original_name,
      width: e.width,
      height: e.height,
    };
    if (typeof e.source_ref === "string" && e.source_ref.length > 0) {
      parsed.source_ref = e.source_ref;
    }
    return parsed;
  });
  return { version: 1, photos };
}

export function upsertManifestPhoto(
  manifest: PhotosManifest,
  entry: PhotosManifestEntry,
  opts?: { clearSourceRef?: boolean },
): PhotosManifest {
  const nextPhotos = manifest.photos.map((p) => ({ ...p }));
  const existingIdx = nextPhotos.findIndex((p) => p.sha256 === entry.sha256);
  if (existingIdx >= 0) {
    const prevSourceRef = opts?.clearSourceRef ? undefined : nextPhotos[existingIdx].source_ref;
    const sourceRef = entry.source_ref ?? prevSourceRef;
    nextPhotos[existingIdx] = {
      file: entry.file,
      sha256: entry.sha256,
      original_name: entry.original_name,
      width: entry.width,
      height: entry.height,
      ...(sourceRef ? { source_ref: sourceRef } : {}),
    };
  } else {
    nextPhotos.push({ ...entry });
  }
  return { version: 1, photos: nextPhotos };
}
