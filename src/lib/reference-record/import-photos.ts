import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { ReferenceRecord } from "./types";

const PATH_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/i;

const EXT_TO_CONTENT_TYPE = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
]);

// Same limit as the bucket (file_size_limit in the migration). A larger file is refused before any write.
export const MAX_REFERENCE_PHOTO_BYTES = 20 * 1024 * 1024;

const NOFOLLOW_FLAG = typeof fsConstants.O_NOFOLLOW === "number" ? fsConstants.O_NOFOLLOW : 0;
const NONBLOCK_FLAG = typeof fsConstants.O_NONBLOCK === "number" ? fsConstants.O_NONBLOCK : 0;

export interface PlannedPhoto {
  storagePath: string;
  contentType: string;
  bytes: Uint8Array;
  sha256: string;
}

export type SafeReadResult =
  | { ok: true; bytes: Uint8Array }
  | {
      ok: false;
      kind: "missing" | "symlink" | "not_file" | "too_large" | "error";
      message: string;
    };

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isPlainFileName(fileName: string): boolean {
  if (fileName.length === 0 || fileName.trim() !== fileName) return false;
  if (fileName === "." || fileName === "..") return false;
  if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("\0")) return false;
  if (fileName.includes("..")) return false;
  if (isAbsolute(fileName)) return false;
  return true;
}

// Reads a regular file without following a symlink. The size is checked on the open file before any
// byte is read, so a very large file chosen by mistake never enters memory.
export async function readRegularFileNoFollow(
  filePath: string,
  maxBytes: number = MAX_REFERENCE_PHOTO_BYTES,
): Promise<SafeReadResult> {
  if (NOFOLLOW_FLAG === 0) {
    try {
      const lst = await lstat(filePath);
      if (lst.isSymbolicLink()) {
        return { ok: false, kind: "symlink", message: "refusing symlink" };
      }
      if (!lst.isFile()) {
        return { ok: false, kind: "not_file", message: "not a regular file" };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, kind: "missing", message: "missing file" };
      }
      return {
        ok: false,
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  let handle;
  try {
    handle = await open(filePath, fsConstants.O_RDONLY | NOFOLLOW_FLAG | NONBLOCK_FLAG);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { ok: false, kind: "missing", message: "missing file" };
    }
    if (code === "ELOOP" || code === "EMLINK") {
      return { ok: false, kind: "symlink", message: "refusing symlink" };
    }
    if (code === "EISDIR") {
      return { ok: false, kind: "not_file", message: "not a regular file" };
    }
    return {
      ok: false,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const fileStat = await handle.stat();
    if (!fileStat.isFile()) {
      return { ok: false, kind: "not_file", message: "not a regular file" };
    }
    if (fileStat.size > maxBytes) {
      return {
        ok: false,
        kind: "too_large",
        message: `file size ${fileStat.size} bytes is above the limit of ${maxBytes} bytes`,
      };
    }
    const buf = await handle.readFile();
    return { ok: true, bytes: new Uint8Array(buf) };
  } catch (err) {
    return {
      ok: false,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await handle.close();
  }
}

export function buildReferencePhotoPath(
  sourceRef: string,
  fileName: string,
): { ok: true; path: string; contentType: string } | { ok: false; error: string } {
  const segments = sourceRef.split(":");
  if (segments.length === 0 || !segments.every((seg) => PATH_SEGMENT_RE.test(seg))) {
    return {
      ok: false,
      error: `invalid storage path segment in source_ref "${sourceRef}" (each segment must match [A-Za-z0-9_-]+)`,
    };
  }

  const rawExt = extname(fileName).toLowerCase();
  const ext = rawExt.startsWith(".") ? rawExt.slice(1) : "";
  const contentType = EXT_TO_CONTENT_TYPE.get(ext);
  if (contentType === undefined) {
    return {
      ok: false,
      error: `unsupported photo extension "${rawExt || "(none)"}" for "${fileName}" (expected jpg, jpeg, png, or webp)`,
    };
  }

  return {
    ok: true,
    path: `${segments.join("/")}.${ext}`,
    contentType,
  };
}

export async function readPlannedPhotos(
  photosDir: string,
  records: ReferenceRecord[],
  problems: string[],
): Promise<Map<string, PlannedPhoto>> {
  const planned = new Map<string, PlannedPhoto>();
  const resolvedPhotosDir = resolve(photosDir);

  let realPhotosDir: string;
  try {
    const dirStat = await stat(resolvedPhotosDir);
    if (!dirStat.isDirectory()) {
      problems.push(`photos path "${photosDir}" is not a directory`);
      return planned;
    }
    realPhotosDir = await realpath(resolvedPhotosDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`photos folder "${photosDir}" could not be read: ${msg}`);
    return planned;
  }

  const manifestPath = join(realPhotosDir, "photos-manifest.json");
  const manifestRead = await readRegularFileNoFollow(manifestPath);
  if (!manifestRead.ok) {
    const detail =
      manifestRead.kind === "symlink"
        ? "refusing symlink"
        : manifestRead.kind === "not_file"
          ? "not a regular file"
          : `could not be read (${manifestRead.message})`;
    problems.push(`photos-manifest.json: ${detail}`);
    return planned;
  }

  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(Buffer.from(manifestRead.bytes).toString("utf8")) as unknown;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    problems.push(`photos-manifest.json: could not be read or parsed (${msg})`);
    return planned;
  }

  if (
    !isPlainObject(parsedManifest) ||
    parsedManifest.version !== 1 ||
    !Array.isArray(parsedManifest.photos)
  ) {
    problems.push("photos-manifest.json: must be an object with version: 1 and a photos array");
    return planned;
  }

  const entriesByRef = new Map<string, Record<string, unknown>>();
  for (let i = 0; i < parsedManifest.photos.length; i += 1) {
    const entry = parsedManifest.photos[i];
    if (!isPlainObject(entry)) {
      problems.push(`photos-manifest.json: photos[${i}] must be an object`);
      continue;
    }
    if (entry.source_ref === undefined || entry.source_ref === null) {
      continue;
    }
    if (typeof entry.source_ref !== "string" || entry.source_ref.trim() === "") {
      problems.push(`photos-manifest.json: photos[${i}].source_ref must be a non-empty string`);
      continue;
    }
    if (entriesByRef.has(entry.source_ref)) {
      problems.push(`photos-manifest.json: duplicate source_ref "${entry.source_ref}"`);
      continue;
    }
    entriesByRef.set(entry.source_ref, entry);
  }

  for (const record of records) {
    const entry = entriesByRef.get(record.source_ref);
    if (!entry) continue;

    let entryValid = true;
    const fileLabel = typeof entry.file === "string" ? entry.file : "(missing file)";

    if (typeof entry.file !== "string" || !isPlainFileName(entry.file)) {
      problems.push(
        `photos-manifest.json: ${record.source_ref} (${fileLabel}): file must be a plain file name inside the photos folder (no path separators or ".."; cannot reference paths outside the photos folder)`,
      );
      continue;
    }

    const pathCheck = buildReferencePhotoPath(record.source_ref, entry.file);
    if (!pathCheck.ok) {
      problems.push(`photos-manifest.json: ${record.source_ref}: ${pathCheck.error}`);
      entryValid = false;
    }

    const expectedSha =
      typeof entry.sha256 === "string" && SHA256_HEX_RE.test(entry.sha256)
        ? entry.sha256.toLowerCase()
        : null;
    if (!expectedSha) {
      problems.push(
        `photos-manifest.json: ${record.source_ref} (${entry.file}): sha256 must be a 64-character hex string`,
      );
      entryValid = false;
    }

    const candidateFile = join(realPhotosDir, entry.file);
    const photoRead = await readRegularFileNoFollow(candidateFile);
    if (!photoRead.ok) {
      const reason =
        photoRead.kind === "missing"
          ? "missing file"
          : photoRead.kind === "symlink"
            ? "refusing symlink"
            : photoRead.kind === "not_file"
              ? "not a regular file"
              : photoRead.kind === "too_large"
                ? photoRead.message
                : `could not read file (${photoRead.message})`;
      problems.push(`photos: ${record.source_ref} (${entry.file}): ${reason}`);
      continue;
    }

    const bytes = photoRead.bytes;
    if (bytes.length === 0 || bytes.length > MAX_REFERENCE_PHOTO_BYTES) {
      problems.push(
        `photos: ${record.source_ref} (${entry.file}): file size ${bytes.length} bytes is not allowed (1 to ${MAX_REFERENCE_PHOTO_BYTES} bytes)`,
      );
      entryValid = false;
    }
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (expectedSha && actualSha !== expectedSha) {
      problems.push(
        `photos: ${record.source_ref} (${entry.file}): sha256 mismatch (expected ${expectedSha}, got ${actualSha})`,
      );
      entryValid = false;
    }

    if (entryValid && pathCheck.ok && expectedSha) {
      planned.set(record.source_ref, {
        storagePath: pathCheck.path,
        contentType: pathCheck.contentType,
        bytes,
        sha256: actualSha,
      });
    }
  }

  return planned;
}
