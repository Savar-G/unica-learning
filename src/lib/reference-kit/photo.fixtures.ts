import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createEmptyManifest,
  parsePhotosManifest,
  PHOTOS_MANIFEST_FILE,
  preparedFileNameForHash,
  sha256Hex,
  upsertManifestPhoto,
} from "./prepare";

// Invented bytes that stand for a prepared photo, with their real SHA-256.
export function fakePhoto(label: string): { bytes: Buffer; sha256: string; file: string } {
  const bytes = Buffer.from(`invented photo ${label}`, "utf8");
  const sha256 = sha256Hex(bytes);
  return { bytes, sha256, file: preparedFileNameForHash(sha256) };
}

// Writes a prepared photo of a work folder and its manifest entry.
export function addPreparedPhoto(
  workDir: string,
  label: string,
  sourceRef?: string,
): { sha256: string; file: string; path: string } {
  const { bytes, sha256, file } = fakePhoto(label);
  const photosDir = join(workDir, "photos");
  mkdirSync(photosDir, { recursive: true });
  const manifestPath = join(photosDir, PHOTOS_MANIFEST_FILE);
  const manifest = existsSync(manifestPath)
    ? parsePhotosManifest(JSON.parse(readFileSync(manifestPath, "utf8")))
    : createEmptyManifest();
  const path = join(photosDir, file);
  writeFileSync(path, bytes);
  const next = upsertManifestPhoto(manifest, {
    file,
    sha256,
    original_name: `${label}.jpg`,
    width: 1600,
    height: 1200,
    ...(sourceRef ? { source_ref: sourceRef } : {}),
  });
  writeFileSync(manifestPath, JSON.stringify(next, null, 2));
  return { sha256, file, path };
}
