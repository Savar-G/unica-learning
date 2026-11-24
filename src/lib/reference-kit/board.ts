import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { assertSafeOutputFile, writeSafeOutputFile } from "@/lib/reference-record/output-guard";
import { isPhotoTooSmall, readRegularFileNoFollow } from "./prepare";

// A design board holds one section for each level. Each photo on the board is one node.
// This module reads the text listing of a board page (as the board connector returns it),
// finds the section of one level, and later keeps the largest downloaded image of each photo.

export interface BoardPhotoNode {
  nodeId: string;
  name: string;
  // A file-name-safe, unique stem for the downloads of this node.
  stem: string;
}

export interface BoardSection {
  nodeId: string;
  name: string;
  photos: BoardPhotoNode[];
}

export interface BoardPlan {
  version: 1;
  section: { nodeId: string; name: string };
  level: string;
  source: string | null;
  photos: BoardPhotoNode[];
}

const TAG_RE = /<(\/?)([a-z][a-z-]*)((?:\s+[A-Za-z:-]+="[^"]*")*)\s*(\/?)>/g;
const ATTR_RE = /([A-Za-z:-]+)="([^"]*)"/g;
const PHOTO_TAGS = new Set(["rounded-rectangle", "rectangle", "image"]);

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-fA-F]+)|#(\d+)|(quot|apos|lt|gt|amp));/gi,
    (match, hex: string | undefined, dec: string | undefined, named: string | undefined) => {
      if (hex !== undefined) {
        const cp = Number.parseInt(hex, 16);
        return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
      }
      if (dec !== undefined) {
        const cp = Number.parseInt(dec, 10);
        return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : match;
      }
      switch (named?.toLowerCase()) {
        case "quot":
          return '"';
        case "apos":
          return "'";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "amp":
          return "&";
        default:
          return match;
      }
    },
  );
}

function readAttrs(raw: string): Map<string, string> {
  const attrs = new Map<string, string>();
  for (const match of raw.matchAll(ATTR_RE)) {
    attrs.set(match[1], decodeEntities(match[2]));
  }
  return attrs;
}

function stemFor(name: string, nodeId: string): string {
  const base = name
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const id = nodeId.replace(/[^0-9]+/g, "-");
  return `${base || "photo"}-${id}`;
}

// Every section of the page, also a section inside another section, with the photo nodes it holds
// directly or through its inner sections.
export function parseBoardSections(listing: string): BoardSection[] {
  const sections: BoardSection[] = [];
  const open: BoardSection[] = [];
  for (const match of listing.matchAll(TAG_RE)) {
    const closing = match[1] === "/";
    const tag = match[2];
    if (tag === "section") {
      if (closing) {
        open.pop();
        continue;
      }
      const attrs = readAttrs(match[3]);
      const section: BoardSection = {
        nodeId: attrs.get("id") ?? "",
        name: attrs.get("name") ?? "",
        photos: [],
      };
      sections.push(section);
      if (match[4] !== "/") open.push(section);
      continue;
    }
    if (closing || !PHOTO_TAGS.has(tag)) continue;
    const attrs = readAttrs(match[3]);
    const nodeId = attrs.get("id");
    if (!nodeId) continue;
    const name = attrs.get("name") ?? "";
    for (const section of open) {
      section.photos.push({ nodeId, name, stem: stemFor(name, nodeId) });
    }
  }
  return sections;
}

export type FindSectionResult =
  | { ok: true; section: BoardSection }
  | { ok: false; reason: string; candidates: string[] };

// The section whose name holds "Level <level>" as whole words, for example "Grade 4 (Abc Level D)".
export function findLevelSection(sections: BoardSection[], level: string): FindSectionResult {
  const wanted = level.trim();
  if (!/^[A-Za-z0-9]+$/.test(wanted)) {
    return { ok: false, reason: `"${level}" is not a level name`, candidates: [] };
  }
  const re = new RegExp(`\\bLevel\\s+${wanted}\\b`, "i");
  const withPhotos = sections.filter((s) => s.photos.length > 0);
  const hits = withPhotos.filter((s) => re.test(s.name));
  const candidates = withPhotos.map((s) => s.name).filter((n) => /\bLevel\s+[A-Za-z0-9]+\b/i.test(n));
  if (hits.length === 1) return { ok: true, section: hits[0] };
  if (hits.length === 0) {
    return { ok: false, reason: `no section is named "Level ${wanted}"`, candidates };
  }
  return {
    ok: false,
    reason: `${hits.length} sections are named "Level ${wanted}"`,
    candidates: hits.map((s) => s.name),
  };
}

// The word before "Level" in a section name, in lower case, when it is a plain word.
// "Grade 4 (Abc Level D)" gives "abc". It is the default source key of the records.
export function sourceKeyFromSectionName(name: string): string | null {
  const match = /([A-Za-z0-9]+)\s+Level\s+[A-Za-z0-9]+\b/i.exec(name);
  return match ? match[1].toLowerCase() : null;
}

export function buildBoardPlan(listing: string, level: string): BoardPlan {
  const found = findLevelSection(parseBoardSections(listing), level);
  if (!found.ok) {
    const list = found.candidates.length > 0 ? ` Sections with a level: ${found.candidates.join("; ")}.` : "";
    throw new Error(`Cannot plan the download: ${found.reason}.${list}`);
  }
  return {
    version: 1,
    section: { nodeId: found.section.nodeId, name: found.section.name },
    level: level.trim().toUpperCase(),
    source: sourceKeyFromSectionName(found.section.name),
    photos: found.section.photos,
  };
}

export interface PickedPhoto {
  stem: string;
  file: string;
  width: number;
  height: number;
}

export interface PickResult {
  picked: PickedPhoto[];
  // Photos whose largest image is under the size a reader needs. A person must add the full-size photo.
  tooSmall: PickedPhoto[];
  // Stems of the plan with no usable download.
  missing: string[];
  // Files that were in the photos folder for a photo that is not in the plan any more.
  removed: string[];
}

const FORMAT_EXT = new Map<string, string>([
  ["jpeg", "jpg"],
  ["png", "png"],
  ["webp", "webp"],
  ["heif", "heic"],
]);

// One board photo can hold a full-size original and a small or narrow preview. The downloads of one
// photo are named "<stem>__<n>.<anything>". This prefers downloads that pass the size rule (long
// and short side) and keeps the one with the most pixels; only when none passes does it take the
// most pixels overall and flag it too small. It writes "<stem>.<ext>" with mode 0600, removing
// older "<stem>.*" files first.
export async function pickLargestDownloads(
  downloadsDir: string,
  photosDir: string,
  plannedStems: string[],
  repoRoot: string,
): Promise<PickResult> {
  const groups = new Map<string, string[]>();
  for (const entry of readdirSync(downloadsDir).sort()) {
    const match = /^(.+)__\d+(?:\.[A-Za-z0-9]+)?$/.exec(entry);
    if (!match) continue;
    if (!lstatSync(join(downloadsDir, entry)).isFile()) continue;
    const list = groups.get(match[1]) ?? [];
    list.push(entry);
    groups.set(match[1], list);
  }

  // With a plan, only the photos of the plan are kept: a photo that left the board leaves the folder.
  const planned = new Set(plannedStems);
  const removed: string[] = [];
  if (planned.size > 0) {
    for (const existing of readdirSync(photosDir)) {
      const stem = existing.replace(/\.[A-Za-z0-9]+$/, "");
      const path = join(photosDir, existing);
      if (!planned.has(stem) && lstatSync(path).isFile()) {
        unlinkSync(path);
        removed.push(existing);
      }
    }
  }

  const picked: PickedPhoto[] = [];
  const tooSmall: PickedPhoto[] = [];
  for (const [stem, files] of groups) {
    if (planned.size > 0 && !planned.has(stem)) continue;
    let best: { file: string; width: number; height: number; ext: string; ok: boolean } | null = null;
    for (const file of files) {
      let meta;
      try {
        meta = await sharp(join(downloadsDir, file)).metadata();
      } catch {
        continue;
      }
      const ext = FORMAT_EXT.get(meta.format ?? "");
      if (!ext || !meta.width || !meta.height) continue;
      const ok = !isPhotoTooSmall(meta.width, meta.height);
      const better =
        !best ||
        (ok && !best.ok) ||
        (ok === best.ok && meta.width * meta.height > best.width * best.height);
      if (better) {
        best = { file, width: meta.width, height: meta.height, ext, ok };
      }
    }
    if (!best) continue;
    const outName = `${stem}.${best.ext}`;
    const outPath = join(photosDir, outName);
    assertSafeOutputFile(outPath, repoRoot);
    const bytes = readRegularFileNoFollow(join(downloadsDir, best.file));
    const stemPrefix = `${stem}.`;
    for (const existing of readdirSync(photosDir)) {
      if (existing !== outName && existing.startsWith(stemPrefix)) {
        unlinkSync(join(photosDir, existing));
      }
    }
    writeSafeOutputFile(outPath, bytes, repoRoot);
    const entry: PickedPhoto = { stem, file: outName, width: best.width, height: best.height };
    picked.push(entry);
    if (isPhotoTooSmall(best.width, best.height)) tooSmall.push(entry);
  }

  const have = new Set(picked.map((p) => p.stem));
  const missing = plannedStems.filter((stem) => !have.has(stem));
  return { picked, tooSmall, missing, removed };
}
