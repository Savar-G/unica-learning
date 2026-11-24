import { joinTopicNumber } from "@/lib/reference-kit/read-parse";
import { normalizeProseText } from "@/lib/reference-kit/normalize";
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
import { comparePages, contentsRefOf, pageRefOf, parsePageRef, refBelongsTo, type PageId } from "./identity";
import { isOnceRead } from "./trusted";
import { PAGE_SIDES, type MethodKey } from "./types";

// A topic is about ten sheets. A much longer range is a mistake in the contents record.
const MAX_TOPIC_SHEETS = 500;

export interface EvidenceInput {
  key: MethodKey;
  // Any order. Records of other levels and sources are ignored.
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

export interface Placement {
  contents: ContentsRecord;
  contentsStatus: TranscriptStatus;
  title: string | NotStated;
  sheetRange: IntRange | NotStated;
  stdTimeMin: IntRange | NotStated;
  pages: PlacedPage[];
  missing: PageId[] | NotStated;
  unplaced: string[];
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
  const range = (value: unknown): IntRange | NotStated => (Array.isArray(value) ? (value as IntRange) : NOT_STATED);
  return contents.topics.map((topic, i) => {
    const once = (field: string): boolean => isOnceRead(contents, `topics[${i}].${field}`);
    return {
      n: topic.n,
      title: once("title") || isSentinel(topic.title) ? NOT_STATED : topic.title,
      sheets: once("sheets") ? NOT_STATED : range(topic.sheets),
      time: once("std_time_min") ? NOT_STATED : range(topic.std_time_min),
    };
  });
}

function inRange(sheet: number, range: IntRange | NotStated): boolean {
  return range !== NOT_STATED && sheet >= range[0] && sheet <= range[1];
}

// Decides which records belong to the topic. A printed sheet range decides when there is one, else the
// printed title. Anything that points at two topics stops, because it would put facts in a wrong topic.
export function placePages(
  input: EvidenceInput,
): { ok: true; placement: Placement } | { ok: false; problems: string[] } {
  const { key } = input;
  const problems: string[] = [];
  const seen = new Set<string>();
  const level: Array<{ record: PageRecord; id: PageId }> = [];
  let contents: ContentsRecord | undefined;

  for (const record of input.records) {
    const ref = record.source_ref;
    const belongs = refBelongsTo(ref, key);
    if (belongs === "no") continue;
    if (seen.has(ref)) {
      problems.push(`two records of "${ref}"`);
      continue;
    }
    seen.add(ref);
    if ((record.single_read ?? []).some((p) => p === "source_ref" || p === "kind")) {
      problems.push(`${ref}: the page id was read by one reader only`);
    }
    if (record.kind === "contents") {
      if (belongs === "yes") contents = record;
      else problems.push(`"${ref}" is another spelling of "${contentsRefOf(key)}"`);
      continue;
    }
    const parsed = parsePageRef(ref);
    if (belongs === "yes" && parsed.ok) level.push({ record, id: parsed.page });
    else problems.push(`"${ref}" is another spelling of a page of level ${key.level} (source "${key.source}")`);
  }

  if (!contents) {
    problems.push(`no contents record "${contentsRefOf(key)}" in the records folder`);
    return { ok: false, problems };
  }
  const contentsStatus = statusOf(input, contents.source_ref);
  if (contentsStatus === "machine_read" && !input.includeMachineRead) {
    problems.push(`${contents.source_ref} has status machine_read, so it gives no facts. Check it, or pass --include-machine-read`);
  }
  const at = contents.topics.findIndex((t) => t.n === key.topic);
  if (at === -1) {
    problems.push(`topic ${key.topic} is not in ${contents.source_ref}`);
    return { ok: false, problems };
  }
  if (isOnceRead(contents, `topics[${at}].n`)) {
    problems.push(`${contents.source_ref}: topic number ${key.topic} was read by one reader only`);
  }
  const chart = readChart(contents);
  const own = chart[at];
  const others = chart.filter((t) => t.n !== key.topic);

  if (own.sheets !== NOT_STATED) {
    const range = own.sheets;
    if (range[1] - range[0] >= MAX_TOPIC_SHEETS) {
      problems.push(`${contents.source_ref}: the sheet range of topic ${key.topic} is too long`);
      return { ok: false, problems };
    }
    for (const other of others) {
      if (other.sheets !== NOT_STATED && other.sheets[0] <= range[1] && range[0] <= other.sheets[1]) {
        problems.push(`${contents.source_ref}: the sheet ranges of topics ${key.topic} and ${other.n} overlap`);
      }
    }
  }

  const sameTitle = (title: string | null, topic: ChartTopic): boolean =>
    title !== null && topic.title !== NOT_STATED && normalizeProseText(title) === normalizeProseText(topic.title);
  const pages: PlacedPage[] = [];
  const unplaced: string[] = [];

  for (const { record, id } of level.sort((a, b) => comparePages(a.id, b.id))) {
    const ref = record.source_ref;
    const status = statusOf(input, ref);
    const used = status !== "machine_read" || input.includeMachineRead;
    const title = pageTitle(record);
    const ownTitle = sameTitle(title, own);
    const otherTitles = others.filter((t) => sameTitle(title, t));
    const otherRange = others.find((t) => inRange(id.sheet, t.sheets));
    const place = (): void => {
      pages.push({ record, id, status, used, titleDiffers: used && title !== null && own.title !== NOT_STATED && !ownTitle });
    };

    if (own.sheets !== NOT_STATED) {
      if (inRange(id.sheet, own.sheets)) {
        if (used && !ownTitle && otherTitles.length > 0) {
          problems.push(`${ref} is in the sheet range of topic ${key.topic} but prints the title of topic ${otherTitles[0].n}`);
        }
        place();
      } else if (used && ownTitle && otherTitles.length === 0 && otherRange) {
        problems.push(`${ref} prints the title of topic ${key.topic} but is in the sheet range of topic ${otherRange.n}`);
      }
      continue;
    }
    if (otherRange) {
      if (used && ownTitle && otherTitles.length === 0) {
        problems.push(`${ref} prints the title of topic ${key.topic} but is in the sheet range of topic ${otherRange.n}`);
      }
    } else if (ownTitle && otherTitles.length > 0) {
      problems.push(`${ref}: topics ${key.topic} and ${otherTitles[0].n} have the same title and no sheet range tells them apart`);
    } else if (ownTitle) {
      place();
    } else if (otherTitles.length === 0) {
      unplaced.push(ref);
    }
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    placement: {
      contents,
      contentsStatus,
      title: own.title,
      sheetRange: own.sheets,
      stdTimeMin: own.time,
      pages,
      missing: own.sheets === NOT_STATED ? NOT_STATED : missingPages(key, own.sheets, pages),
      unplaced,
    },
  };
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
