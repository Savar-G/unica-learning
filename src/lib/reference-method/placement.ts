import { joinTopicNumber, sameTopicTitle } from "@/lib/reference-kit/read-parse";
import {
  NOT_STATED,
  type ContentsRecord,
  type IntRange,
  type NotStated,
  type PageRecord,
  type ReferenceRecord,
  type TranscriptStatus,
} from "@/lib/reference-record";
import { isSentinel } from "@/lib/reference-record/validate-parts";
import { comparePages, contentsRefOf, isBoundedNumber, MAX_NUMBER, pageRefOf, parsePageRef, refBelongsTo, type PageId } from "./identity";
import { isOnceRead } from "./trusted";
import type { MethodKey } from "./types";

// A sheet has a front (a) and a back (b).
const PAGE_SIDES = ["a", "b"];

// A topic is about ten sheets. A much longer range is a mistake in the contents record.
const MAX_TOPIC_SHEETS = 500;

export interface EvidenceInput {
  key: MethodKey;
  // Any order, one record for each source_ref (the loader refuses two). Other levels and sources are ignored.
  records: readonly ReferenceRecord[];
  statusByRef: ReadonlyMap<string, TranscriptStatus>;
  includeMachineRead: boolean;
}

export interface PlacedPage {
  record: PageRecord;
  id: PageId;
  status: TranscriptStatus;
  used: boolean;
  titleDiffers: boolean;
}

export function statusOf(input: EvidenceInput, ref: string): TranscriptStatus {
  return input.statusByRef.get(ref) ?? "machine_read";
}

// The printed title of a page with its number at the end. Null when it is not known.
function pageTitle(record: PageRecord): string | null {
  const { title, number } = record.topic;
  if (typeof title !== "string" || isSentinel(title) || isOnceRead(record, "topic.title")) return null;
  if (typeof number !== "number") return title;
  return isOnceRead(record, "topic.number") ? null : joinTopicNumber(title, number);
}

interface ChartTopic {
  n: number;
  title: string | NotStated;
  sheets: IntRange | NotStated;
  time: IntRange | NotStated;
}

function readChart(contents: ContentsRecord): ChartTopic[] {
  return contents.topics.map((topic, i) => {
    const once = (field: string): boolean => isOnceRead(contents, `topics[${i}].${field}`);
    const range = (field: "sheets" | "std_time_min"): IntRange | NotStated => {
      const value = topic[field];
      return Array.isArray(value) && !once(field) ? value : NOT_STATED;
    };
    return {
      n: topic.n,
      title: once("title") || isSentinel(topic.title) ? NOT_STATED : topic.title,
      sheets: range("sheets"),
      time: range("std_time_min"),
    };
  });
}

function inRange(sheet: number, range: IntRange | NotStated): boolean {
  return range !== NOT_STATED && sheet >= range[0] && sheet <= range[1];
}

// Decides which records belong to the topic. A printed sheet range decides when there is one, else the
// printed title. Anything that points at two topics stops, because it would put facts in a wrong topic.
export function placePages(input: EvidenceInput) {
  const { key } = input;
  const contentsRef = contentsRefOf(key);
  const problems: string[] = [];
  const level: Array<{ record: PageRecord; id: PageId }> = [];
  let contents: ContentsRecord | undefined;

  for (const record of input.records) {
    const ref = record.source_ref;
    const belongs = refBelongsTo(ref, key);
    if (belongs === "no") continue;
    if ((record.single_read ?? []).some((p) => p === "source_ref" || p === "kind")) {
      problems.push(`${ref}: the page id was read by one reader only`);
    }
    const parsed = parsePageRef(ref);
    if (belongs === "yes" && record.kind === "contents") contents = record;
    else if (belongs === "yes" && record.kind === "page" && parsed.ok) level.push({ record, id: parsed.page });
    else {
      problems.push(`"${ref}" is another spelling of a record of "${key.source}:${key.level}", or its sheet number is over ${MAX_NUMBER}`);
    }
  }
  const stop = (...more: string[]) => ({ ok: false as const, problems: [...problems, ...more] });
  if (!contents) return stop(`no contents record "${contentsRef}" in the records folder`);
  if (statusOf(input, contentsRef) === "machine_read" && !input.includeMachineRead) {
    problems.push(`${contentsRef} has status machine_read, so it gives no facts. Check it, or use --include-machine-read with draft or gaps`);
  }
  const chart = readChart(contents);
  const unusable = contents.topics.find((t) => ![t.n, t.sheets, t.std_time_min].flat().every((v) => typeof v !== "number" || isBoundedNumber(v)));
  if (unusable) return stop(`${contentsRef}: topic ${unusable.n} has a number over ${MAX_NUMBER}`);
  const own = chart.find((t) => t.n === key.topic);
  if (!own) return stop(`topic ${key.topic} is not in ${contentsRef}`);
  if (isOnceRead(contents, `topics[${chart.indexOf(own)}].n`)) {
    problems.push(`${contentsRef}: topic number ${key.topic} was read by one reader only`);
  }
  if (own.sheets !== NOT_STATED) {
    const [first, last] = own.sheets;
    if (last - first >= MAX_TOPIC_SHEETS) return stop(`${contentsRef}: the sheet range of topic ${key.topic} is too long`);
    for (const other of chart) {
      if (other !== own && other.sheets !== NOT_STATED && other.sheets[0] <= last && first <= other.sheets[1]) {
        problems.push(`${contentsRef}: the sheet ranges of topics ${key.topic} and ${other.n} overlap`);
      }
    }
  }

  const pages: PlacedPage[] = [];
  const unplaced: string[] = [];
  for (const { record, id } of level.sort((a, b) => comparePages(a.id, b.id))) {
    const ref = record.source_ref;
    const status = statusOf(input, ref);
    const used = status !== "machine_read" || input.includeMachineRead;
    // An unchecked title decides nothing.
    const title = used ? pageTitle(record) : null;
    const byTitle = chart.filter((t) => title !== null && t.title !== NOT_STATED && sameTopicTitle(title, t.title));
    const byRange = chart.find((t) => inRange(id.sheet, t.sheets));
    const ownTitle = byTitle.includes(own);
    if (byRange && (byRange === own ? byTitle.length > 0 && !ownTitle : ownTitle && byTitle.length === 1)) {
      problems.push(`${ref} prints the title of topic ${byTitle[0].n} but is in the sheet range of topic ${byRange.n}`);
    }
    // A topic of this title with no range can still hold the page.
    if (!byRange && ownTitle && byTitle.every((t) => t.sheets !== NOT_STATED)) {
      problems.push(`${ref} prints the title of topic ${key.topic} but is in no sheet range of the contents record`);
    }
    if (byRange ? byRange === own : own.sheets === NOT_STATED && ownTitle) {
      if (!byRange && byTitle.length > 1) {
        const other = byTitle.find((t) => t !== own);
        problems.push(`${ref}: topics ${key.topic} and ${other?.n} have the same title and no sheet range tells them apart`);
      }
      pages.push({ record, id, status, used, titleDiffers: title !== null && own.title !== NOT_STATED && !ownTitle });
    } else if (!byRange && own.sheets === NOT_STATED && byTitle.length === 0) {
      unplaced.push(ref);
    }
  }
  if (problems.length > 0) return stop();

  const missing: PageId[] | NotStated = own.sheets === NOT_STATED ? NOT_STATED : missingPages(key, own.sheets, pages);
  // topic: the line of the topic in the contents chart.
  return { ok: true as const, placement: { contents, topic: own, pages, missing, unplaced } };
}

function missingPages(key: MethodKey, range: IntRange, pages: PlacedPage[]): PageId[] {
  const have = new Set(pages.map((p) => p.record.source_ref));
  const out: PageId[] = [];
  for (let sheet = range[0]; sheet <= range[1]; sheet += 1) {
    for (const side of PAGE_SIDES) {
      if (!have.has(pageRefOf(key, sheet, side))) out.push({ source: key.source, level: key.level, sheet, side });
    }
  }
  return out;
}
