import { KIT_REF_SEGMENT_RE } from "@/lib/reference-kit/answers";
import type { MethodKey } from "./types";

// The one definition of which topic a method record belongs to. The record, its file name and its
// table row all take their identity from here.

const TOPIC_NUMBER_RE = /^[1-9]\d{0,8}$/;
const PAGE_REF_RE = /^([A-Za-z0-9]+):([A-Za-z0-9]+):([1-9]\d*)([a-z])$/;

export function makeMethodKey(
  source: unknown,
  level: unknown,
  topic: unknown,
): { ok: true; key: MethodKey } | { ok: false; error: string } {
  if (typeof source !== "string" || !KIT_REF_SEGMENT_RE.test(source)) {
    return { ok: false, error: "source must be letters and digits only" };
  }
  if (typeof level !== "string" || !KIT_REF_SEGMENT_RE.test(level)) {
    return { ok: false, error: "level must be letters and digits only" };
  }
  if ((typeof topic !== "number" && typeof topic !== "string") || !TOPIC_NUMBER_RE.test(String(topic))) {
    return { ok: false, error: "topic must be a whole number from 1" };
  }
  // The kit stores the level of a page id in upper case.
  return { ok: true, key: { source, level: level.toUpperCase(), topic: Number(topic) } };
}

export function methodRef(key: MethodKey): string {
  return `${key.source}:${key.level}:topic-${key.topic}`;
}

export function methodFileName(key: MethodKey): string {
  return `${key.source}-${key.level}-topic-${key.topic}.json`;
}

export function contentsRefOf(key: Pick<MethodKey, "source" | "level">): string {
  return `${key.source}:${key.level}:contents`;
}

export interface PageId {
  source: string;
  level: string;
  sheet: number;
  side: string;
}

// Only the canonical spelling: an upper-case level and a sheet number with no leading zero. Another
// spelling would give one page two ids.
export function parsePageRef(ref: string): { ok: true; page: PageId } | { ok: false } {
  const match = PAGE_REF_RE.exec(ref);
  if (!match) return { ok: false };
  const [, source, level, sheetText, side] = match;
  const sheet = Number(sheetText);
  if (level !== level.toUpperCase() || !Number.isSafeInteger(sheet)) return { ok: false };
  return { ok: true, page: { source, level, sheet, side } };
}

export function pageRefOf(key: Pick<MethodKey, "source" | "level">, sheet: number, side: string): string {
  return `${key.source}:${key.level}:${sheet}${side}`;
}

// other_spelling: the same source and level in another letter case, which would be a second id.
export function refBelongsTo(ref: string, key: Pick<MethodKey, "source" | "level">): "yes" | "no" | "other_spelling" {
  const [source, level] = ref.split(":");
  if (source === key.source && level === key.level) return "yes";
  return source?.toLowerCase() === key.source.toLowerCase() && level?.toLowerCase() === key.level.toLowerCase()
    ? "other_spelling"
    : "no";
}

export function comparePages(a: Pick<PageId, "sheet" | "side">, b: Pick<PageId, "sheet" | "side">): number {
  if (a.sheet !== b.sheet) return a.sheet - b.sheet;
  return a.side < b.side ? -1 : a.side > b.side ? 1 : 0;
}
