// Invented records for the tests of this folder. No real page is in here.
import type {
  ArithExpr,
  ContentsRecord,
  ContentsTopic,
  Example,
  Expr,
  ItemForm,
  PageItem,
  PageRecord,
  Scaffold,
  TranscriptStatus,
} from "@/lib/reference-record";
import { buildEvidence } from "./evidence";
import type { MethodKey, TopicEvidence } from "./types";

export const KEY: MethodKey = { source: "demo", level: "Z", topic: 1 };

export function add(a: number, b: number): ArithExpr {
  return { kind: "arith", op: "add", operands: [a, b] };
}

export function makeItem(n: number, expr: Expr | null, form: ItemForm | null = "horizontal"): PageItem {
  return {
    n,
    printed: "line",
    form: expr === null ? null : form,
    expr,
    responses: expr === null ? [] : [{ position: "after_equals", cue: null, answer: "0", answer_source: "reader" }],
  };
}

export function makeExample(expr: Expr | null, form: ItemForm = "horizontal", extra: Partial<Example> = {}): Example {
  return {
    position: "top",
    relation: "sequence",
    parts: [{ form, expr }],
    steps: [
      { n: 1, shows: "setup", printed: "line" },
      { n: 2, shows: "carry", printed: "line" },
    ],
    marks: [{ kind: "arrow" }],
    ...extra,
  };
}

export function makePage(
  sheet: string,
  opts: {
    items?: PageItem[];
    examples?: PageRecord["examples"];
    scaffolds?: Scaffold[] | "unclear" | "not_stated";
    title?: string | null;
    level?: string;
    single_read?: string[];
  } = {},
): PageRecord {
  return {
    kind: "page",
    source_ref: `demo:${opts.level ?? "Z"}:${sheet}`,
    topic: { title: opts.title === undefined ? "Joining Pebbles 1" : opts.title },
    sections: [
      {
        instruction: "Find each total.",
        scaffolds: opts.scaffolds ?? [],
        items: opts.items ?? [makeItem(1, add(23, 4)), makeItem(2, add(31, 5))],
      },
    ],
    examples: opts.examples ?? [],
    score_bands: "not_stated",
    readers: ["one", "two"],
    ...(opts.single_read ? { single_read: opts.single_read } : {}),
  };
}

export function makeContents(topics?: ContentsTopic[], extra: Partial<ContentsRecord> = {}): ContentsRecord {
  return {
    kind: "contents",
    source_ref: "demo:Z:contents",
    topics: topics ?? [
      { n: 1, title: "Joining Pebbles 1", sheets: [11, 12], std_time_min: [2, 4] },
      { n: 2, title: "Joining Pebbles 2", sheets: [13, 14], std_time_min: [3, 5] },
    ],
    ...extra,
  };
}

// Every record is double_read unless a status is given.
export function statusesOf(
  records: Array<{ source_ref: string }>,
  given: Record<string, TranscriptStatus> = {},
): Map<string, TranscriptStatus> {
  return new Map(records.map((r) => [r.source_ref, given[r.source_ref] ?? "double_read"]));
}

export function evidenceFor(
  pages: PageRecord[],
  opts: {
    contents?: ContentsRecord;
    statuses?: Record<string, TranscriptStatus>;
    key?: MethodKey;
    includeMachineRead?: boolean;
  } = {},
): ReturnType<typeof buildEvidence> {
  const records = [...pages, opts.contents ?? makeContents()];
  return buildEvidence({
    key: opts.key ?? KEY,
    records,
    statusByRef: statusesOf(records, opts.statuses),
    includeMachineRead: opts.includeMachineRead ?? false,
  });
}

export function okEvidence(...args: Parameters<typeof evidenceFor>): TopicEvidence {
  const built = evidenceFor(...args);
  if (!built.ok) throw new Error(built.problems.join("\n"));
  return built.evidence;
}
