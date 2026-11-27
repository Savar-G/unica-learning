// One command turns a reported bug into a failing fixture (UNI-261, architecture 10.3): a synthetic book input (or a
// replay bundle), what is wrong in words, and what must be true once it is fixed. The fixture is one JSON file that
// bug-fixture.test.ts runs; it is written only when it fails today, so it reproduces the bug. A real family's book never
// goes into a git repository: inside one, the input must prove that it is invented (an invented snapshot, invented book
// and child ids, and no id or email of a person anywhere in it), or nothing is written.
import { existsSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBook } from "@/lib/workbook-v2/build/build-book";
import { tokenText } from "@/lib/workbook-v2/contract";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { gitRepoOf, resolvedPath } from "@/lib/workbook-v2/testing/git-repo";
import { readReplayExpected, readSavedInput, replayBook, type ReplayExpected } from "./replay";

export const BUG_FIXTURES_DIR = "src/lib/workbook-v2-publish/bug-fixtures";

/** The known synthetic snapshot ids of the workbook engine's invented levels. */
export const KNOWN_SYNTHETIC_SNAPSHOT_IDS: ReadonlySet<string> = new Set([
  "invented-level-3-v1",
  "invented-level-3-wide-v1",
  "invented-level-2-v1",
  "invented-division-v1",
  "invented-level-2-facts-v1",
  "invented-level-3-topic-20-v1",
  "invented-level-2-places-v1",
]);

/** What must be true once the bug is fixed. `page` is the page in the book, from 1. */
export type BugExpectation =
  | { kind: "builds" }
  | { kind: "refused"; problem: string }
  | { kind: "page-text"; page: number; text: string; present: boolean }
  | { kind: "replays" };

export interface BugFixture {
  format: 1;
  name: string;
  failure: string;
  renderer: "fake" | "typst";
  input: { format: 1; snapshot: unknown; book: unknown };
  expected?: ReplayExpected;
  expect: BugExpectation;
}

export interface BugFixtureRequest extends Omit<BugFixture, "format" | "input"> { input: unknown; outDir: string }

const NAME = /^[a-z][a-z0-9-]{2,63}$/;
/** The ids that tests invent. A real child, book or workbook id is a UUID and never matches. */
const SYNTHETIC_ID = /^(example|golden|invented|synthetic|fixture)-[A-Za-z0-9-]+$/;
/** Synthetic page links always use an invented token prefix so a scrubbed replay can never retain a live page link. */
const SYNTHETIC_QR_URL = /^https:\/\/unicalearning\.com\/tutor\/p\/(example|golden|invented|synthetic|fixture)-[A-Za-z0-9-]+$/;
const TUTOR_LINK = /https?:\/\/[^\s"']*\/tutor\/p\/([^\s"'/?#]+)/gi;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL = /[^\s@"]+@[^\s@"]+\.[a-z]{2,}/i;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Every text in a value, keys too. */
function textsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) textsOf(v, out);
  else if (isObject(value)) {
    for (const [key, v] of Object.entries(value)) {
      out.push(key);
      textsOf(v, out);
    }
  }
  return out;
}

/**
 * Why a fixture (or input + expected) does not prove that it is invented; none when it does.
 * Accepts either a full `BugFixture` (validating `failure`, `expect`, `input`, and `expected`) or raw `(input, expected)`.
 */
export function syntheticProblems(inputOrFixture: unknown, expected?: ReplayExpected): string[] {
  const isFull = isObject(inputOrFixture) && inputOrFixture.format === 1 && "input" in inputOrFixture && "expect" in inputOrFixture;
  const input = isFull ? inputOrFixture.input : inputOrFixture;
  const payload = isFull ? inputOrFixture : [input, expected ?? null];
  const problems: string[] = [];
  const snapshot = isObject(input) ? input.snapshot : undefined;
  const book = isObject(input) ? input.book : undefined;
  const id = isObject(snapshot) ? snapshot.id : undefined;
  if (typeof id !== "string" || !KNOWN_SYNTHETIC_SNAPSHOT_IDS.has(id)) {
    problems.push(`the snapshot ${JSON.stringify(id ?? null)} is not a known invented snapshot`);
  }
  for (const name of ["bookId", "childId"]) {
    const value = isObject(book) ? book[name] : undefined;
    if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) problems.push(`the ${name} ${JSON.stringify(value ?? null)} is not an invented id`);
  }
  const history = isObject(book) && isObject(book.history) && Array.isArray(book.history.books) ? book.history.books : [];
  for (const earlier of history) {
    const value = isObject(earlier) ? earlier.bookId : undefined;
    if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) problems.push(`the history names the book ${JSON.stringify(value ?? null)}, which is not an invented id`);
  }
  const sheets = isObject(book) && Array.isArray(book.sheets) ? book.sheets : [];
  for (const [i, sheet] of sheets.entries()) {
    const qr = isObject(sheet) && isObject(sheet.qr) ? sheet.qr : undefined;
    for (const side of ["front", "back"] as const) {
      const value = qr?.[side];
      if (typeof value !== "string" || !SYNTHETIC_QR_URL.test(value)) {
        problems.push(`sheet ${i + 1} ${side} QR ${JSON.stringify(value ?? null)} is not an invented page link`);
      }
    }
  }
  const texts = textsOf(payload);
  if (texts.some((t) => UUID.test(t))) problems.push("the fixture holds a UUID, which may be the id of a real family, child or book");
  if (texts.some((t) => EMAIL.test(t))) problems.push("the fixture holds an email address");
  for (const text of texts) {
    for (const match of text.matchAll(TUTOR_LINK)) {
      if (!SYNTHETIC_ID.test(match[1])) {
        problems.push(`the fixture holds a non-synthetic page link token ${JSON.stringify(match[1])}`);
        break;
      }
    }
  }
  return problems;
}

/** Extracts every printed string on a page, including both single-line `text` ink and word-problem `flow` ink. */
export const pageTexts = (built: Extract<Awaited<ReturnType<typeof buildBook>>, { status: "built" }>, page: number): string =>
  (built.pages[page - 1]?.model.regions ?? [])
    .flatMap((r) => r.ink.flatMap((ink) => (ink.kind === "text" ? [ink.text] : ink.kind === "flow" ? [ink.tokens.map(tokenText).join(" ")] : [])))
    .join("\n");

/** Runs a fixture: `ok` when what it expects is true (the bug is fixed), with what happened in words. */
export async function runBugFixture(fixture: BugFixture, renderer: Renderer): Promise<{ ok: boolean; actual: string }> {
  const { expect } = fixture;
  if (expect.kind === "replays") {
    if (!fixture.expected) return { ok: false, actual: "the fixture has no expected replay" };
    const replay = await replayBook(fixture.input, fixture.expected, renderer);
    return replay.ok ? { ok: true, actual: "the replay is the same" } : { ok: false, actual: `${replay.firstDifference.kind}: ${replay.firstDifference.message}` };
  }
  const built = await buildBook({ snapshot: fixture.input.snapshot, book: fixture.input.book }, renderer);
  if (expect.kind === "builds") return built.status === "built" ? { ok: true, actual: "the book builds" } : { ok: false, actual: `the book does not build: ${built.problems.join("; ")}` };
  if (expect.kind === "refused") {
    if (built.status === "built") return { ok: false, actual: "the book builds, and it must be refused" };
    const ok = built.problems.some((p) => p.includes(expect.problem));
    return { ok, actual: `the book is refused: ${built.problems.join("; ")}` };
  }
  if (built.status !== "built") return { ok: false, actual: `the book does not build: ${built.problems.join("; ")}` };
  if (!built.pages[expect.page - 1]) return { ok: false, actual: `the book has ${built.pages.length} pages, and no page ${expect.page}` };
  const has = pageTexts(built, expect.page).includes(expect.text);
  return { ok: has === expect.present, actual: `page ${expect.page} ${has ? "prints" : "does not print"} ${JSON.stringify(expect.text)}` };
}

function readExpectation(raw: unknown): BugExpectation | string {
  if (!isObject(raw)) return "the expectation must be an object";
  if (raw.kind === "builds" || raw.kind === "replays") return { kind: raw.kind };
  if (raw.kind === "refused" && typeof raw.problem === "string" && raw.problem !== "") return { kind: "refused", problem: raw.problem };
  if (raw.kind === "page-text" && typeof raw.page === "number" && Number.isSafeInteger(raw.page) && raw.page >= 1 && typeof raw.text === "string" && raw.text !== "" && typeof raw.present === "boolean") {
    return { kind: "page-text", page: raw.page, text: raw.text, present: raw.present };
  }
  return "the expectation must be builds, replays, refused with a problem, or page-text with a page, a text and present";
}

/** A fixture of a file, or why it is not one. */
export function readBugFixture(raw: unknown): BugFixture | string {
  if (!isObject(raw) || raw.format !== 1 || typeof raw.name !== "string" || !NAME.test(raw.name) || typeof raw.failure !== "string" || raw.failure.trim() === "") {
    return "the bug fixture is not of format 1 with a name and a failure";
  }
  if (raw.renderer !== "fake" && raw.renderer !== "typst") return "the renderer of a bug fixture must be fake or typst";
  const input = readSavedInput(raw.input);
  if (typeof input === "string") return input;
  const expect = readExpectation(raw.expect);
  if (typeof expect === "string") return expect;
  let expected: ReplayExpected | undefined;
  if (raw.expected !== undefined) {
    const parsed = readReplayExpected(raw.expected);
    if (typeof parsed === "string") return parsed;
    expected = parsed;
  }
  if (expect.kind === "replays" && expected === undefined) return "a fixture that expects a replay needs the expected replay";
  return {
    format: 1,
    name: raw.name,
    failure: raw.failure,
    renderer: raw.renderer,
    input: { format: 1, snapshot: input.snapshot, book: input.book },
    ...(expected ? { expected } : {}),
    expect,
  };
}

/** Writes a complete fixture file into a sibling staging folder and links it exclusively, leaving no partial file on failure. */
function publishFixtureAtomic(dir: string, file: string, text: string): void {
  mkdirSync(dir, { recursive: true });
  const staging = mkdtempSync(join(dir, ".workbook-v2-fixture-"));
  try {
    const staged = join(staging, "fixture.json");
    writeFileSync(staged, text, { flag: "wx" });
    try {
      linkSync(staged, file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") throw new Error(`${file} exists: choose another name.`);
      throw error;
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * Writes the fixture of a bug as `<outDir>/<name>.json`, or stops with nothing written: when the input is not a book input,
 * when the fixture passes today (it does not reproduce the bug), when the file exists, or when the folder is in a git
 * repository and the full fixture payload does not prove that it is invented.
 */
export async function createBugFixture(request: BugFixtureRequest, renderer: Renderer): Promise<{ file: string; actual: string }> {
  if (!NAME.test(request.name)) throw new Error(`The fixture name ${JSON.stringify(request.name)} must be 3 to 64 small letters, digits and dashes, starting with a letter.`);
  if (request.failure.trim() === "") throw new Error("Say what is wrong: the failure must not be empty.");
  const raw = isObject(request.input) ? request.input : {};
  const input = readSavedInput({ format: 1, snapshot: raw.snapshot, book: raw.book });
  if (typeof input === "string") throw new Error(`The input is not a book input: ${input}.`);
  const safeOutDir = resolvedPath(request.outDir);
  const safeFile = resolvedPath(join(safeOutDir, `${request.name}.json`));
  const fixture: BugFixture = {
    format: 1, name: request.name, failure: request.failure, renderer: request.renderer,
    input: { format: 1, snapshot: input.snapshot, book: input.book }, ...(request.expected ? { expected: request.expected } : {}), expect: request.expect,
  };
  const checked = readBugFixture(JSON.parse(JSON.stringify(fixture)));
  if (typeof checked === "string") throw new Error(`The fixture is not valid: ${checked}.`);
  const repo = gitRepoOf(request.outDir) ?? gitRepoOf(safeFile);
  const privacy = syntheticProblems(checked);
  if (repo !== null && privacy.length > 0) {
    throw new Error([`Refused: ${request.outDir} is inside the git repository ${repo}, and the fixture may contain real family data:`, ...privacy.map((p) => `- ${p}`), "Write the fixture to a folder outside every git repository, or use an invented book."].join("\n"));
  }
  if (existsSync(safeFile)) throw new Error(`${safeFile} exists: choose another name.`);
  const run = await runBugFixture(checked, renderer);
  if (run.ok) throw new Error(`The fixture passes today (${run.actual}), so it does not reproduce the bug. Nothing was written.`);
  publishFixtureAtomic(safeOutDir, safeFile, `${JSON.stringify(checked, null, 2)}\n`);
  return { file: safeFile, actual: run.actual };
}
