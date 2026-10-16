// The admin export of the raw test data (#200, spec #181, D-118): one file per dataset, as CSV or JSON. Pure: the rows
// come through ExportReader (src/lib/admin-store.ts reads the database with the admin's session; the in-memory reader
// in src/lib/admin-export-memory.ts is for tests and the local demo). The export reads and writes one page at a time,
// so a download of thousands of tests streams within the function's time limit and never holds the whole table.
// Drawings and strokes are their storage paths only. No names, emails or postal codes: the ids link to the admin pages.
// One more dataset: add its id, its entry in DATASETS and, for a new table, its read in both readers.
import type { LearnerProfile, Question, Route } from "@/lib/assessment";
import { ADMIN_PATH } from "@/lib/admin-view";

/** The export page, and the route that sends each file. */
export const ADMIN_EXPORT_PATH = `${ADMIN_PATH}/export`;
export const EXPORT_ROUTE = "/api/admin/export";

/** One stored row, by column name, as the database returns it. */
export type ExportRow = Record<string, unknown>;

/** Tables the export reads page by page, by id. */
export type PagedTable = "assessments" | "children";
/** Tables of rows that belong to a test (assessment_id). */
export type TestTable = "answers" | "question_shows" | "assessment_facts" | "fact_answers" | "learner_profiles";

/**
 * The export's reads. Every read is for an admin and returns every row (row-level security and the admin_* functions
 * decide); the export leaves out the test families itself.
 */
export interface ExportReader {
  /** The parent ids of the team's own families and of the families marked as a test (D-099). */
  testFamilies(): Promise<readonly string[]>;
  /** Up to `limit` rows with an id after `after` (null: from the first), in id order, with only these columns. */
  page(table: PagedTable, columns: readonly string[], after: string | null, limit: number): Promise<ExportRow[]>;
  /** Every row of `table` for these tests, with only these columns, in test id order and then in `order`. */
  ofTests(table: TestTable, columns: readonly string[], order: readonly string[], testIds: readonly string[]): Promise<ExportRow[]>;
}

export const EXPORT_FORMATS = ["csv", "json"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export type DatasetId = "tests" | "questions" | "answers" | "question_shows" | "facts" | "fact_answers" | "profiles" | "questionnaire";

export interface ExportRequest {
  dataset: DatasetId;
  format: ExportFormat;
  /** Include the team's and the test families' rows (D-099: left out by default). */
  withTests: boolean;
}

/**
 * Where a dataset's rows come from: the exported tests themselves (`select`: the test columns `rows` reads, when the
 * rows are made from each test), the rows of a table that belong to them, or a table of its own, read by id (a row with
 * a parent_id of a test family is left out).
 */
type Read =
  | { from: "tests"; select?: readonly string[]; rows?: (test: ExportRow) => ExportRow[] }
  | { from: "test rows"; table: TestTable; order: readonly string[] }
  | { from: "table"; table: PagedTable };

interface Dataset {
  id: DatasetId;
  /** For the export page. */
  label: string;
  /** What one row is, for the export page. */
  row: string;
  columns: readonly string[];
  read: Read;
  /**
   * A JSON object column the CSV writes as one cell per top-level part, `<column>.<part>`, then `<column>.other` with
   * any part not listed (empty when none). A whole learner profile is longer than a spreadsheet cell (32,767
   * characters); each part fits. The JSON keeps the object whole.
   */
  csvParts?: { column: string; parts: readonly string[] };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const ROUTES: readonly Route[] = ["up", "stay", "down"];

/**
 * Every question of a stored test (assessments.test), as drawn: stage 1, then stage 2 of each route. `position`: the
 * question's place in the test, as answers.position numbers it, for the questions of stage 1 and of the route the test
 * took; null for the other routes' questions, which the child never got.
 */
function drawnQuestions(test: ExportRow): ExportRow[] {
  const stored = isObject(test.test) ? test.test : {};
  const list = (v: unknown) => (Array.isArray(v) ? (v as Question[]) : []);
  const stage1 = list(stored.stage1);
  const stage2 = isObject(stored.stage2) ? stored.stage2 : {};
  const row = (q: Question, stage: 1 | 2, route: Route | null, index: number, position: number | null): ExportRow => ({
    assessment_id: test.id, stage, route, index, position,
    question_id: q.id, template_id: q.templateId, level: q.level, strand: q.strand, format: q.format, question: q,
  });
  return [
    ...stage1.map((q, i) => row(q, 1, null, i, i)),
    ...ROUTES.flatMap((r) => list(stage2[r]).map((q, i) => row(q, 2, r, i, test.route === r ? stage1.length + i : null))),
    // #190 adds the extra round's questions here.
  ];
}

/** The learner profile's parts (#196), in the profile's order. */
const PROFILE_PARTS = [
  "schemaVersion", "test", "level", "strands", "standards", "strengths", "struggles", "wordsOrNumbers", "facts", "behaviour",
  "preferences", "parent", "unknowns", "ai",
] as const satisfies readonly (keyof LearnerProfile)[];

/** Every dataset, in the export page's order. Column names are the stored ones, so a row joins back to its table. */
const DATASETS: readonly Dataset[] = [
  {
    id: "tests",
    label: "Tests",
    row: "a test: the child, the school grade and curriculum, the status and times, the route, the placement, the help answer, the device and the break.",
    columns: [
      "id", "created_at", "parent_id", "child_id", "grade", "province", "status", "seed", "started_at", "last_answer_at",
      "completed_at", "resume_until", "route", "help", "placement",
      // The test context (#185).
      "device", "break_started_at", "break_ended_at", "break_skipped", "break_ms",
      // #190 adds the extra round's columns (extra_*) here.
    ],
    read: { from: "tests" },
  },
  {
    id: "questions",
    label: "Questions as drawn",
    row: "a question drawn for a test, with its template, values, choices in their order, figure and answer. Position matches the answers; empty for a route the test did not take.",
    // The stored test is longer than a spreadsheet cell, so its questions are rows of their own.
    columns: ["assessment_id", "stage", "route", "index", "position", "question_id", "template_id", "level", "strand", "format", "question"],
    read: { from: "tests", select: ["route", "test"], rows: drawnQuestions },
  },
  {
    id: "answers",
    label: "Answers",
    row: "an answer: right or wrong, the misconception, the times, the answer changes, read-aloud, time away, the typed working, and the paths of the drawing and the strokes.",
    columns: [
      "id", "created_at", "assessment_id", "position", "question_id", "template_id", "values", "response", "correct",
      "misconception", "time_ms",
      // The answer timeline (#184): the server's times and what the child did before Next.
      "shown_at", "answered_at", "answer_changes", "read_aloud_count", "read_aloud_at_ms", "away_count", "away_ms",
      // Shown work (#67, #186): paths in the private bucket, never the drawing or the strokes themselves.
      "work_required", "work_path", "work_text", "strokes_path",
      // #190 adds the extra round's marker (round) here.
    ],
    read: { from: "test rows", table: "answers", order: ["position"] },
  },
  {
    id: "question_shows",
    label: "Serve times",
    row: "a place in a test the server served, with when it first served it.",
    columns: ["assessment_id", "position", "question_id", "shown_at", "created_at"],
    read: { from: "test rows", table: "question_shows", order: ["position"] },
  },
  {
    id: "facts",
    label: "Quick facts",
    row: "a test's quick facts section: when it started and the facts drawn.",
    columns: ["assessment_id", "created_at", "started_at", "test"],
    read: { from: "test rows", table: "assessment_facts", order: [] },
  },
  {
    id: "fact_answers",
    label: "Quick fact answers",
    row: "a fact answered: the answer, right or wrong, and the time on it by the server and by the browser.",
    columns: ["id", "created_at", "assessment_id", "position", "fact_id", "response", "correct", "at_ms", "server_ms", "browser_ms"],
    read: { from: "test rows", table: "fact_answers", order: ["position"] },
  },
  {
    id: "profiles",
    label: "Learner profiles",
    row: "a finished test's learner profile, as versioned JSON. The CSV has one column per part of the profile.",
    columns: ["id", "created_at", "built_at", "assessment_id", "parent_id", "child_id", "schema_version", "profile"],
    read: { from: "test rows", table: "learner_profiles", order: [] },
    csvParts: { column: "profile", parts: PROFILE_PARTS },
  },
  {
    id: "questionnaire",
    label: "Questionnaire answers",
    row: "a child (id is the child's id): the school grade and curriculum, and the parent's answers on the learning card. Empty is no answer.",
    columns: [
      "id", "created_at", "parent_id", "grade", "province", "learning_styles", "interests", "learning_note", "math_feeling",
      "learning_goal", "weekly_time", "learning_updated_at",
    ],
    read: { from: "table", table: "children" },
  },
];

/** The datasets for the export page: id, label and what one row is. */
export const EXPORT_DATASETS: readonly Pick<Dataset, "id" | "label" | "row">[] = DATASETS.map(({ id, label, row }) => ({ id, label, row }));

const dataset = (id: DatasetId) => DATASETS.find((d) => d.id === id)!;

/** The export a query asks for (?dataset=answers&format=csv&tests=1), or null when it names no dataset or format. */
export function parseExportRequest(query: URLSearchParams): ExportRequest | null {
  const d = DATASETS.find((x) => x.id === query.get("dataset"));
  const format = EXPORT_FORMATS.find((f) => f === query.get("format"));
  return d && format ? { dataset: d.id, format, withTests: query.get("tests") === "1" } : null;
}

/** The download link of one file. `demo`: the made-up families of local development. */
export function exportHref({ dataset: id, format, withTests }: ExportRequest, demo = false): string {
  const q = new URLSearchParams({ dataset: id, format });
  if (withTests) q.set("tests", "1");
  if (demo) q.set("demo", "1");
  return `${EXPORT_ROUTE}?${q}`;
}

/** "unica-answers-2026-10-16.csv": the dataset and the day of the export in Pacific time, and whether test families are in. */
export function exportFileName({ dataset: id, format, withTests }: ExportRequest, now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return `unica-${id.replaceAll("_", "-")}-${day}${withTests ? "-with-test-families" : ""}.${format}`;
}

export const EXPORT_TYPES: Record<ExportFormat, string> = { csv: "text/csv; charset=utf-8", json: "application/json; charset=utf-8" };

/** Tests per page; the rows of a page of tests are read together. */
const TEST_PAGE = 100;
/** Rows per page of a table of its own. */
const ROW_PAGE = 1000;

/** The pages of a table by id, until a page comes back empty: a database that caps a page lower still gives every row. */
async function* byId(reader: ExportReader, table: PagedTable, columns: readonly string[], limit: number): AsyncGenerator<ExportRow[]> {
  for (let after: string | null = null; ;) {
    const page = await reader.page(table, columns, after, limit);
    if (page.length === 0) return;
    after = String(page[page.length - 1].id);
    yield page;
  }
}

/** The pages of rows of one dataset, without the test families' unless asked for. */
async function* pages(reader: ExportReader, d: Dataset, withTests: boolean): AsyncGenerator<ExportRow[]> {
  const left = withTests ? new Set<string>() : new Set(await reader.testFamilies());
  const kept = (rows: ExportRow[]) => rows.filter((r) => !left.has(String(r.parent_id)));
  const { read } = d;
  if (read.from === "table") {
    for await (const page of byId(reader, read.table, [...new Set(["id", ...d.columns])], ROW_PAGE)) yield kept(page);
    return;
  }
  const columns = ["id", "parent_id", ...(read.from === "test rows" ? [] : (read.select ?? d.columns.filter((c) => c !== "id" && c !== "parent_id")))];
  for await (const page of byId(reader, "assessments", columns, TEST_PAGE)) {
    const tests = kept(page);
    if (read.from === "tests") yield read.rows ? tests.flatMap(read.rows) : tests;
    else if (tests.length > 0) yield await reader.ofTests(read.table, d.columns, read.order, tests.map((t) => String(t.id)));
  }
}

/** The UTF-8 byte order mark: without it, Excel reads a CSV in the computer's old code page and garbles "Zoë". */
const BOM = "\uFEFF";

/** A plain number, which a spreadsheet reads as a number and never as a formula. */
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/**
 * A cell of the CSV (RFC 4180): a null is empty, nested values are their JSON text, and a cell with a separator is
 * quoted. A text that a spreadsheet would run as a formula (it starts with =, +, -, @, a tab or a carriage return and
 * is not a plain number) gets a leading apostrophe, so opening the file never runs what a family typed. The JSON keeps
 * every value as stored.
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const csvLine = (cells: readonly unknown[]) => `${cells.map(csvCell).join(",")}\r\n`;

/** The CSV's header and the cells of a row, with a split column as its parts. */
function csvColumns({ columns, csvParts }: Dataset): { head: string[]; cells: (row: ExportRow) => unknown[] } {
  if (!csvParts) return { head: [...columns], cells: (r) => columns.map((c) => r[c]) };
  const { column, parts } = csvParts;
  const known = new Set<string>(parts);
  return {
    head: columns.flatMap((c) => (c === column ? [...parts, "other"].map((p) => `${column}.${p}`) : [c])),
    cells: (r) => columns.flatMap((c) => {
      if (c !== column) return [r[c]];
      const value = r[c];
      if (!isObject(value)) return [...parts.map(() => null), value];
      const other = Object.entries(value).filter(([k]) => !known.has(k));
      return [...parts.map((p) => value[p]), other.length > 0 ? Object.fromEntries(other) : null];
    }),
  };
}

/** How a format writes the rows of a dataset: before the rows, each row, between rows and after them. */
interface Writer {
  start: string;
  row: (row: ExportRow) => string;
  between: string;
  end: string;
}

function writer(format: ExportFormat, d: Dataset): Writer {
  if (format === "csv") {
    const { head, cells } = csvColumns(d);
    return { start: BOM + csvLine(head), row: (r) => csvLine(cells(r)), between: "", end: "" };
  }
  // One array of objects with the dataset's columns in order; JSON never takes a byte order mark (RFC 8259).
  return { start: "[", row: (r) => `\n${JSON.stringify(Object.fromEntries(d.columns.map((c) => [c, r[c] ?? null])))}`, between: ",", end: "\n]\n" };
}

/** The download, a piece at a time: the first piece is the start of the file with the first page. */
export async function* exportChunks(reader: ExportReader, request: ExportRequest): AsyncGenerator<string> {
  const d = dataset(request.dataset);
  const w = writer(request.format, d);
  let piece = w.start;
  let first = true;
  for await (const rows of pages(reader, d, request.withTests)) {
    for (const r of rows) {
      piece += (first ? "" : w.between) + w.row(r);
      first = false;
    }
    yield piece;
    piece = "";
  }
  yield piece + w.end;
}

/**
 * The download as a byte stream that reads the next page only when the last one is sent. The first page is read before
 * it returns, so a database that fails at once is an error the route can answer; a failure after that ends the stream
 * with an error (`failed` hears of it), so a cut file never arrives as a whole one.
 */
export async function exportStream(reader: ExportReader, request: ExportRequest, failed: (error: unknown) => void = () => {}): Promise<ReadableStream<Uint8Array>> {
  const pieces = exportChunks(reader, request);
  let next: IteratorResult<string> | null = await pieces.next();
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const piece = next ?? (await pieces.next());
        next = null;
        if (piece.done) controller.close();
        else controller.enqueue(encoder.encode(piece.value));
      } catch (e) {
        failed(e);
        controller.error(e);
      }
    },
    async cancel() {
      await pieces.return(undefined);
    },
  });
}
