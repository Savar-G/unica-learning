// One command turns a reported bug into a failing fixture (UNI-261, architecture 10.3): a synthetic book input (or a
// replay bundle), what is wrong in words, and what must be true once it is fixed. The fixture is one JSON file that
// bug-fixture.test.ts runs; it is written only when it fails today, so it reproduces the bug. A real family's book never
// goes into a git repository: inside one, the input must prove that it is invented (an invented snapshot, invented book
// and child ids, and no id or email of a person anywhere in it), or nothing is written.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildBook } from "@/lib/workbook-v2/build/build-book";
import type { Renderer } from "@/lib/workbook-v2/renderer";
import { gitRepoOf } from "@/lib/workbook-v2/testing/git-repo";
import { readSavedInput, replayBook, type ReplayExpected } from "./replay";

export const BUG_FIXTURES_DIR = "src/lib/workbook-v2-publish/bug-fixtures";

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
const SYNTHETIC_ID = /^(example|golden|invented|synthetic|fixture)-[A-Za-z0-9-]*$/;
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

/** Why the input does not prove that it is invented; none when it does. */
export function syntheticProblems(input: unknown, expected?: ReplayExpected): string[] {
  const problems: string[] = [];
  const snapshot = isObject(input) ? input.snapshot : undefined;
  const book = isObject(input) ? input.book : undefined;
  const id = isObject(snapshot) ? snapshot.id : undefined;
  if (typeof id !== "string" || !id.startsWith("invented-")) problems.push(`the snapshot ${JSON.stringify(id ?? null)} is not an invented snapshot (its id must start with "invented-")`);
  for (const name of ["bookId", "childId"]) {
    const value = isObject(book) ? book[name] : undefined;
    if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) problems.push(`the ${name} ${JSON.stringify(value ?? null)} is not an invented id`);
  }
  const history = isObject(book) && isObject(book.history) && Array.isArray(book.history.books) ? book.history.books : [];
  for (const earlier of history) {
    const value = isObject(earlier) ? earlier.bookId : undefined;
    if (typeof value !== "string" || !SYNTHETIC_ID.test(value)) problems.push(`the history names the book ${JSON.stringify(value ?? null)}, which is not an invented id`);
  }
  const texts = textsOf([input, expected ?? null]);
  if (texts.some((t) => UUID.test(t))) problems.push("the input holds a UUID, which may be the id of a real family, child or book");
  if (texts.some((t) => EMAIL.test(t))) problems.push("the input holds an email address");
  return problems;
}

const pageTexts = (built: Extract<Awaited<ReturnType<typeof buildBook>>, { status: "built" }>, page: number): string =>
  (built.pages[page - 1]?.model.regions ?? []).flatMap((r) => r.ink.flatMap((ink) => (ink.kind === "text" ? [ink.text] : []))).join("\n");

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
  if (!isObject(raw) || raw.format !== 1 || typeof raw.name !== "string" || !NAME.test(raw.name) || typeof raw.failure !== "string") return "the bug fixture is not of format 1 with a name and a failure";
  if (raw.renderer !== "fake" && raw.renderer !== "typst") return "the renderer of a bug fixture must be fake or typst";
  const input = readSavedInput(raw.input);
  if (typeof input === "string") return input;
  const expect = readExpectation(raw.expect);
  if (typeof expect === "string") return expect;
  if (expect.kind === "replays" && !isObject(raw.expected)) return "a fixture that expects a replay needs the expected replay";
  return { ...(raw as unknown as BugFixture), expect };
}

/**
 * Writes the fixture of a bug as `<outDir>/<name>.json`, or stops with nothing written: when the input is not a book input,
 * when the fixture passes today (it does not reproduce the bug), when the file exists, or when the folder is in a git
 * repository and the input does not prove that it is invented.
 */
export async function createBugFixture(request: BugFixtureRequest, renderer: Renderer): Promise<{ file: string; actual: string }> {
  if (!NAME.test(request.name)) throw new Error(`The fixture name ${JSON.stringify(request.name)} must be 3 to 64 small letters, digits and dashes, starting with a letter.`);
  if (request.failure.trim() === "") throw new Error("Say what is wrong: the failure must not be empty.");
  const raw = isObject(request.input) ? request.input : {};
  const input = readSavedInput({ format: 1, snapshot: raw.snapshot, book: raw.book });
  if (typeof input === "string") throw new Error(`The input is not a book input: ${input}.`);
  const repo = gitRepoOf(request.outDir);
  const privacy = syntheticProblems(input, request.expected);
  if (repo !== null && privacy.length > 0) {
    throw new Error([`Refused: ${request.outDir} is inside the git repository ${repo}, and the input may be a real family's book:`, ...privacy.map((p) => `- ${p}`), "Write the fixture to a folder outside every git repository, or use an invented book."].join("\n"));
  }
  const file = join(request.outDir, `${request.name}.json`);
  if (existsSync(file)) throw new Error(`${file} exists: choose another name.`);
  const fixture: BugFixture = {
    format: 1, name: request.name, failure: request.failure, renderer: request.renderer,
    input: { format: 1, snapshot: input.snapshot, book: input.book }, ...(request.expected ? { expected: request.expected } : {}), expect: request.expect,
  };
  const checked = readBugFixture(JSON.parse(JSON.stringify(fixture)));
  if (typeof checked === "string") throw new Error(`The fixture is not valid: ${checked}.`);
  const run = await runBugFixture(checked, renderer);
  if (run.ok) throw new Error(`The fixture passes today (${run.actual}), so it does not reproduce the bug. Nothing was written.`);
  mkdirSync(request.outDir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "wx" });
  return { file, actual: run.actual };
}
