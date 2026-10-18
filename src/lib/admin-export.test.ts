import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checked } from "@/lib/assessment/scripted-child";
import { createSession, finish, learnerProfile, nextQuestion, startExtraRound, storedTest, submitAnswer, type ProfileAnswer, type Session } from "@/lib/assessment";
import { EXPORT_DATASETS, exportChunks, type ExportReader, type ExportRequest } from "@/lib/admin-export";
import { memoryExportReader, type ExportData } from "@/lib/admin-export-memory";

// The admin export (#200, spec #181), through its public interface: what a download holds, read back as a spreadsheet
// or a JSON parser reads it. The database is the in-memory reader with the same paging rules as the Supabase reader.

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

/** RFC 4180, as a spreadsheet reads a CSV file: quoted cells may hold commas, doubled quotes and line breaks. */
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else if (c === "\n" || c === "\r") throw new Error(`bare line break at ${i}`);
    else if (c === '"') throw new Error(`quote inside an unquoted cell at ${i}`);
    else cell += c;
  }
  if (quoted) throw new Error("unclosed quote");
  if (cell !== "" || row.length > 0) throw new Error("the last line has no line break");
  return rows;
}

/** The whole download as text. */
async function download(data: Partial<ExportData>, request: ExportRequest): Promise<string> {
  let text = "";
  for await (const chunk of exportChunks(memoryExportReader(data), request)) text += chunk;
  return text;
}

const csv = async (data: Partial<ExportData>, request: Omit<ExportRequest, "format">) => {
  const text = await download(data, { ...request, format: "csv" });
  const [head, ...rows] = readCsv(text.replace(/^\uFEFF/, ""));
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};

const test = (n: number, over: Record<string, unknown> = {}) => ({
  id: uuid(n), created_at: "2026-10-16T10:00:00+00:00", parent_id: uuid(1000 + n), child_id: uuid(2000 + n),
  grade: 3, province: "BC", status: "completed", seed: 42, started_at: "2026-10-16T10:00:00+00:00",
  last_answer_at: "2026-10-16T10:20:00+00:00", completed_at: "2026-10-16T10:21:00+00:00", resume_until: "2026-10-17T10:00:00+00:00",
  route: "up", help: "no", placement: { workingLevel: 3, flags: [] }, device: null,
  break_started_at: null, break_ended_at: null, break_skipped: null, break_ms: null,
  extra_offered_at: null, extra_skipped_at: null, extra_started_at: null, extra_finished_at: null,
  test: { seed: 42, profile: { grade: 3, province: "BC" }, stage1: [], stage2: { up: [], stay: [], down: [] } },
  ...over,
});

let answerId = 0;
const answer = (testN: number, position: number, over: Record<string, unknown> = {}) => ({
  id: uuid(500_000 + ++answerId), created_at: "2026-10-16T10:01:00+00:00", assessment_id: uuid(testN), position,
  question_id: `q${position}`, template_id: "add-within-10", values: { a: 3, b: 4 }, response: "7", correct: true,
  misconception: null, time_ms: 8000, shown_at: "2026-10-16T10:00:50+00:00", answered_at: "2026-10-16T10:01:00+00:00",
  answer_changes: [{ value: "6", atMs: 3000 }, { value: "7", atMs: 5000 }], read_aloud_count: 1, read_aloud_at_ms: [1200],
  away_count: 0, away_ms: 0, work_required: false, work_path: null, work_text: null, strokes_path: null, round: "main",
  ...over,
});

describe("the CSV", () => {
  it("reads back in a spreadsheet: one header, one line per test, and every value in its own cell", async () => {
    const placement = { workingLevel: 3, note: 'said "seven", then 8,\nthen 9', flags: ["fast"] };
    const rows = await csv({ assessments: [test(1, { placement, device: { deviceClass: "tablet", input: "touch" } }), test(2, { help: null, route: null })] }, { dataset: "tests", withTests: false });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: uuid(1), grade: "3", status: "completed", route: "up", help: "no", seed: "42", break_skipped: "" });
    // Nested fields are JSON text in one cell.
    expect(JSON.parse(rows[0].placement)).toEqual(placement);
    expect(JSON.parse(rows[0].device)).toEqual({ deviceClass: "tablet", input: "touch" });
    // A null is an empty cell.
    expect(rows[1]).toMatchObject({ id: uuid(2), help: "", route: "" });
  });

  it("starts with the UTF-8 byte order mark, so a spreadsheet reads accents and other scripts correctly", async () => {
    const text = await download({ assessments: [test(1, { placement: { note: "Zoë, 学生" } })] }, { dataset: "tests", format: "csv", withTests: false });
    expect(text.startsWith("\uFEFFid,")).toBe(true);
    expect(text.indexOf("\uFEFF", 1)).toBe(-1);
    expect(JSON.parse((await csv({ assessments: [test(1, { placement: { note: "Zoë, 学生" } })] }, { dataset: "tests", withTests: false }))[0].placement)).toEqual({ note: "Zoë, 学生" });
  });

  it("never lets a spreadsheet run a cell as a formula, and keeps negative numbers as numbers", async () => {
    const rows = await csv({ assessments: [
      test(1, { help: "=HYPERLINK(\"http://x\")", route: "+1+cmd", status: "@SUM(A1)" }),
      test(2, { help: "-2+3", route: "-3", status: "-4.5" }),
      test(3, { help: "\tx", route: "\rx", status: "-" }),
    ] }, { dataset: "tests", withTests: false });
    expect(rows.map((r) => [r.help, r.route, r.status])).toEqual([
      ["'=HYPERLINK(\"http://x\")", "'+1+cmd", "'@SUM(A1)"],
      ["'-2+3", "-3", "-4.5"],
      ["'\tx", "'\rx", "'-"],
    ]);
  });
});

describe("the JSON", () => {
  it("is one array of the same rows, with nested fields as JSON values and every value as stored", async () => {
    const placement = { workingLevel: 3, flags: ["fast"] };
    const text = await download({ assessments: [test(1, { placement, help: "=1+1" }), test(2, { help: null })] }, { dataset: "tests", format: "json", withTests: false });
    expect(text.startsWith("[")).toBe(true);
    const rows = JSON.parse(text);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: uuid(1), grade: 3, help: "=1+1", placement, break_skipped: null });
    expect(rows[1].help).toBeNull();
    // The same columns as the CSV, in the same order; the stored test is not a column of the tests.
    expect(Object.keys(rows[0])).toEqual(readCsv((await download({ assessments: [test(1)] }, { dataset: "tests", format: "csv", withTests: false })).slice(1))[0]);
    expect(rows[0]).not.toHaveProperty("test");
  });

  it("is an empty array when there are no rows", async () => {
    expect(JSON.parse(await download({}, { dataset: "tests", format: "json", withTests: false }))).toEqual([]);
  });
});

describe("test families (D-099)", () => {
  // Test 2 is a team member's own family, test 3 a family marked as a test.
  const data = { assessments: [test(1), test(2), test(3)], testFamilies: [uuid(1002), uuid(1003)] };

  it("are left out by default", async () => {
    expect((await csv(data, { dataset: "tests", withTests: false })).map((r) => r.id)).toEqual([uuid(1)]);
  });

  it("are in when the admin asks for them", async () => {
    expect((await csv(data, { dataset: "tests", withTests: true })).map((r) => r.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
  });
});

/** The reader, with a log of every read and the most rows any read returned; `cap`: a database that returns at most this many rows per read. */
function counted(data: Partial<ExportData>, cap = Infinity) {
  const inner = memoryExportReader(data);
  const log = { reads: 0, most: 0 };
  const seen = <T extends unknown[]>(rows: T) => { log.reads++; log.most = Math.max(log.most, rows.length); return rows; };
  const reader: ExportReader = {
    testFamilies: async () => { log.reads++; return inner.testFamilies(); },
    page: async (table, columns, after, limit) => seen((await inner.page(table, columns, after, limit)).slice(0, cap)),
    ofTests: async (table, columns, order, ids) => { log.most = Math.max(log.most, ids.length); return seen(await inner.ofTests(table, columns, order, ids)); },
  };
  return { reader, log };
}

describe("a large export", () => {
  const many = { assessments: Array.from({ length: 1234 }, (_, i) => test(i + 1)), testFamilies: [] };

  it("reads 1,000+ tests a page at a time and starts the download after the first page", async () => {
    const { reader, log } = counted(many);
    const pieces = exportChunks(reader, { dataset: "tests", format: "csv", withTests: false });
    const first = await pieces.next();
    // The first piece is out after the test families and one page: the rest is not read yet.
    expect(log.reads).toBe(2);
    let text = first.value as string;
    for await (const piece of pieces) text += piece;
    expect(readCsv(text.slice(1))).toHaveLength(1 + 1234);
    expect(log.most).toBeLessThanOrEqual(100);
    expect(log.reads).toBeGreaterThan(12);
  });

  it("keeps every row when the database returns shorter pages than asked", async () => {
    const { reader } = counted(many, 7);
    let text = "";
    for await (const piece of exportChunks(reader, { dataset: "tests", format: "json", withTests: false })) text += piece;
    const ids = JSON.parse(text).map((r: { id: string }) => r.id);
    expect(ids).toHaveLength(1234);
    expect(new Set(ids).size).toBe(1234);
  });
});

describe("the answers", () => {
  const drawn = answer(1, 1, {
    correct: false, response: "8", misconception: "O1", work_required: true, work_text: "3 + 4, then I added 1",
    work_path: `${uuid(1001)}/${uuid(1)}/q1-ab12.png`, strokes_path: `${uuid(1001)}/${uuid(1)}/q1-ab12.strokes.json`,
  });
  const data = {
    assessments: [test(1), test(2), test(3)],
    // Out of order, as a database may store them; test 3 is a test family's.
    answers: [answer(2, 0), drawn, answer(3, 0), answer(1, 0)],
    testFamilies: [uuid(1003)],
  };

  it("hold every captured field, by test and place, with the drawing and the strokes as their storage paths", async () => {
    const rows = await csv(data, { dataset: "answers", withTests: false });
    expect(rows.map((r) => [r.assessment_id, r.position])).toEqual([[uuid(1), "0"], [uuid(1), "1"], [uuid(2), "0"]]);
    expect(rows[1]).toMatchObject({
      question_id: "q1", template_id: "add-within-10", response: "8", correct: "false", misconception: "O1", time_ms: "8000",
      shown_at: "2026-10-16T10:00:50+00:00", answered_at: "2026-10-16T10:01:00+00:00", read_aloud_count: "1", away_count: "0", away_ms: "0",
      work_required: "true", work_text: "3 + 4, then I added 1",
      work_path: `${uuid(1001)}/${uuid(1)}/q1-ab12.png`, strokes_path: `${uuid(1001)}/${uuid(1)}/q1-ab12.strokes.json`,
    });
    expect(JSON.parse(rows[1].values)).toEqual({ a: 3, b: 4 });
    expect(JSON.parse(rows[1].answer_changes)).toEqual([{ value: "6", atMs: 3000 }, { value: "7", atMs: 5000 }]);
    expect(JSON.parse(rows[1].read_aloud_at_ms)).toEqual([1200]);
  });

  it("leave out a test family's answers unless asked for", async () => {
    expect((await csv(data, { dataset: "answers", withTests: true })).map((r) => r.assessment_id)).toContain(uuid(3));
  });

  it("are read for at most a page of tests at a time", async () => {
    const tests = Array.from({ length: 1234 }, (_, i) => test(i + 1));
    const { reader, log } = counted({ assessments: tests, answers: tests.flatMap((_, i) => [answer(i + 1, 0), answer(i + 1, 1)]) });
    let text = "";
    for await (const piece of exportChunks(reader, { dataset: "answers", format: "json", withTests: false })) text += piece;
    expect(JSON.parse(text)).toHaveLength(2468);
    expect(log.most).toBeLessThanOrEqual(200);
  });
});

describe("the serve times and the quick facts", () => {
  const show = (testN: number, position: number) => ({ assessment_id: uuid(testN), position, question_id: `q${position}`, shown_at: `2026-10-16T10:0${position % 10}:00+00:00`, created_at: "2026-10-16T10:00:00+00:00" });
  const facts = (testN: number) => ({ assessment_id: uuid(testN), created_at: "2026-10-16T10:15:00+00:00", started_at: "2026-10-16T10:15:00+00:00", test: { facts: [{ id: "m-3x4", a: 3, b: 4, op: "x" }] } });
  const fact = (testN: number, position: number) => ({ id: uuid(800_000 + testN * 100 + position), created_at: "2026-10-16T10:16:00+00:00", assessment_id: uuid(testN), position, fact_id: "m-3x4", response: "12", correct: true, at_ms: 4000 + position, server_ms: 1900, browser_ms: 1500 });
  const data = {
    assessments: [test(1), test(2)],
    question_shows: [show(1, 10), show(2, 0), show(1, 2)],
    assessment_facts: [facts(2), facts(1)],
    fact_answers: [fact(1, 10), fact(2, 0), fact(1, 2)],
    testFamilies: [uuid(1002)],
  };

  it("hold when the server served each question, by test and place", async () => {
    const rows = await csv(data, { dataset: "question_shows", withTests: true });
    expect(rows.map((r) => [r.assessment_id, r.position, r.question_id, r.shown_at])).toEqual([
      [uuid(1), "2", "q2", "2026-10-16T10:02:00+00:00"], [uuid(1), "10", "q10", "2026-10-16T10:00:00+00:00"], [uuid(2), "0", "q0", "2026-10-16T10:00:00+00:00"],
    ]);
    expect((await csv(data, { dataset: "question_shows", withTests: false })).map((r) => r.assessment_id)).toEqual([uuid(1), uuid(1)]);
  });

  it("hold each test's facts as drawn, and each fact answer with the server's and the browser's time", async () => {
    const drawn = await csv(data, { dataset: "facts", withTests: true });
    expect(drawn.map((r) => r.assessment_id)).toEqual([uuid(1), uuid(2)]);
    expect(JSON.parse(drawn[0].test)).toEqual(facts(1).test);
    const answers = await csv(data, { dataset: "fact_answers", withTests: false });
    expect(answers.map((r) => [r.assessment_id, r.position, r.response, r.correct, r.at_ms, r.server_ms, r.browser_ms])).toEqual([
      [uuid(1), "2", "12", "true", "4002", "1900", "1500"], [uuid(1), "10", "12", "true", "4010", "1900", "1500"],
    ]);
  });
});

/** A whole grade 7 test where every answer is a coded wrong answer, so its profile is as large as the core makes one. */
function wrongAll(): { session: Session; profile: NonNullable<ReturnType<typeof learnerProfile>> } {
  let session = createSession({ grade: 7, province: "BC" }, 7);
  for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
    session = checked(submitAnswer(session, { questionId: q.id, response: q.wrong[0]?.value ?? "no idea", timeMs: 9000 }));
  }
  const questions = [...session.stage1, ...session.stage2[session.route!]];
  const answers: ProfileAnswer[] = session.answers.map((a, i) => ({
    question: questions[i], response: a.response, correct: a.correct, misconception: a.misconception, timeMs: a.timeMs,
    work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  }));
  const profile = learnerProfile({ placement: finish(session, null, "no"), answers, help: "no", learning: null })!;
  return { session, profile };
}

/** A spreadsheet cell holds at most this many characters (Excel). */
const CELL_MAX = 32_767;

describe("the learner profiles", () => {
  const { profile } = wrongAll();
  const stored = (testN: number, value: unknown = profile) => ({
    id: uuid(900_000 + testN), created_at: "2026-10-16T10:22:00+00:00", built_at: "2026-10-16T10:22:00+00:00",
    assessment_id: uuid(testN), parent_id: uuid(1000 + testN), child_id: uuid(2000 + testN), schema_version: 1, profile: value,
  });
  const data = { assessments: [test(1), test(2)], learner_profiles: [stored(2), stored(1)], testFamilies: [uuid(1002)] };

  it("are whole in the JSON", async () => {
    const rows = JSON.parse(await download(data, { dataset: "profiles", format: "json", withTests: true }));
    expect(rows.map((r: { assessment_id: string }) => r.assessment_id)).toEqual([uuid(1), uuid(2)]);
    expect(rows[0]).toMatchObject({ parent_id: uuid(1001), child_id: uuid(2001), schema_version: 1, profile });
    expect(JSON.parse(await download(data, { dataset: "profiles", format: "json", withTests: false }))).toHaveLength(1);
  });

  it("take one CSV cell per part, so the largest profile fits a spreadsheet's cells and reads back whole", async () => {
    expect(JSON.stringify(profile).length).toBeGreaterThan(CELL_MAX * 0.6);
    const text = await download(data, { dataset: "profiles", format: "csv", withTests: false });
    const [head, ...rows] = readCsv(text.slice(1));
    expect(rows).toHaveLength(1);
    for (const cell of rows[0]) expect(cell.length).toBeLessThanOrEqual(CELL_MAX);
    const parts = Object.fromEntries(head.flatMap((h, i) => (h.startsWith("profile.") && rows[0][i] !== "" ? [[h.slice(8), JSON.parse(rows[0][i])]] : [])));
    // A null part is an empty cell, as every null in the CSV.
    expect(parts).toEqual(Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null)));
  });

  it("keep a part the export does not know yet, in the CSV's last profile column", async () => {
    const later = { ...profile, schemaVersion: 2, newPart: { a: 1 } };
    const rows = await csv({ ...data, learner_profiles: [stored(1, later)] }, { dataset: "profiles", withTests: false });
    expect(JSON.parse(rows[0]["profile.other"])).toEqual({ newPart: { a: 1 } });
    expect(rows[0]["profile.schemaVersion"]).toBe("2");
  });

  it("keep the words-or-numbers finding of a profile stored before D-121 as raw data, in the last profile column", async () => {
    const old = { ...profile, wordsOrNumbers: { finding: "gap", skills: [{ id: "4.5-multiply-1-digit", finding: "words-harder", words: { correct: 1, total: 3 }, numbers: { correct: 3, total: 3 } }] } };
    const rows = await csv({ ...data, learner_profiles: [stored(1, old)] }, { dataset: "profiles", withTests: false });
    expect(Object.keys(rows[0])).not.toContain("profile.wordsOrNumbers");
    expect(JSON.parse(rows[0]["profile.other"])).toEqual({ wordsOrNumbers: old.wordsOrNumbers });
  });
});

describe("the questions as drawn", () => {
  const { session } = wrongAll();
  const stored = storedTest(session);
  const route = session.route!;
  const data = {
    assessments: [test(1, { route, test: stored }), test(2, { route: null, status: "in_progress", test: stored })],
    testFamilies: [uuid(1003)],
  };

  it("are one row per question of the stored test, each with its place in the test as the answers number it", async () => {
    const rows = await csv(data, { dataset: "questions", withTests: false });
    const mine = rows.filter((r) => r.assessment_id === uuid(1));
    const all = [...stored.stage1, ...stored.stage2.up, ...stored.stage2.stay, ...stored.stage2.down];
    expect(mine).toHaveLength(all.length);
    for (const cell of rows.flatMap((r) => Object.values(r))) expect(cell.length).toBeLessThanOrEqual(CELL_MAX);
    // The questions the child got, in order, carry the answers' positions; the other routes' questions carry none.
    const asked = [...stored.stage1, ...stored.stage2[route]];
    const placed = mine.filter((r) => r.position !== "").sort((a, b) => Number(a.position) - Number(b.position));
    expect(placed.map((r) => r.question_id)).toEqual(asked.map((q) => q.id));
    expect(placed.map((r) => r.position)).toEqual(asked.map((_, i) => String(i)));
    expect(session.answers.map((a) => a.questionId)).toEqual(asked.map((q) => q.id));
    // Each row has the whole question as drawn: its template, values, choices in their order, figure and answer.
    const first = mine.find((r) => r.question_id === stored.stage1[0].id)!;
    expect(first).toMatchObject({ stage: "1", route: "", index: "0", template_id: stored.stage1[0].templateId, level: String(stored.stage1[0].level) });
    expect(JSON.parse(first.question)).toEqual(stored.stage1[0]);
    const other = (["up", "stay", "down"] as const).find((r) => r !== route)!;
    expect(mine.find((r) => r.question_id === stored.stage2[other][0].id)).toMatchObject({ stage: "2", route: other, index: "0", position: "" });
  });

  it("have no places before the test chose its route, and leave out the test families' tests unless asked for", async () => {
    const rows = await csv(data, { dataset: "questions", withTests: false });
    expect(rows.filter((r) => r.assessment_id === uuid(2) && r.stage === "2" && r.position !== "")).toEqual([]);
    expect(rows.filter((r) => r.assessment_id === uuid(2) && r.stage === "1").map((r) => r.position)).toEqual(stored.stage1.map((_, i) => String(i)));
    const all = await csv({ ...data, testFamilies: [uuid(1002)] }, { dataset: "questions", withTests: false });
    expect(new Set(all.map((r) => r.assessment_id))).toEqual(new Set([uuid(1)]));
  });
});

describe("the extra round (#190)", () => {
  /** A grade 4 test from seed 1 with the first answer wrong (an early sign), then the extra round drawn and taken. */
  function withRound(): Session {
    let session = createSession({ grade: 4, province: "BC" }, 1);
    for (let q = nextQuestion(session); q; q = nextQuestion(session)) {
      session = checked(submitAnswer(session, { questionId: q.id, response: session.answers.length === 0 ? "no idea" : q.answer, timeMs: 20_000 }));
    }
    return startExtraRound(session);
  }
  const session = withRound();
  const stored = storedTest(session);
  const route = session.route!;
  const main = stored.stage1.length + stored.stage2[route].length;
  const times = {
    // A round stopped part way: skipped after it started (D-116).
    stopped: { extra_offered_at: "2026-10-16T10:20:00+00:00", extra_started_at: "2026-10-16T10:20:05+00:00", extra_skipped_at: "2026-10-16T10:24:00+00:00" },
    finished: { extra_offered_at: "2026-10-16T10:20:00+00:00", extra_started_at: "2026-10-16T10:20:05+00:00", extra_finished_at: "2026-10-16T10:30:00+00:00" },
  };
  const data = {
    assessments: [test(1, { route, test: stored, ...times.finished }), test(2, { route, test: stored, ...times.stopped })],
    answers: [answer(1, main - 1), answer(1, main, { question_id: "x-0", round: "extra" })],
  };

  it("has its times on each test: offered, skipped (a stop when after the start), started and finished", async () => {
    const rows = await csv(data, { dataset: "tests", withTests: true });
    expect(rows[0]).toMatchObject({ ...times.finished, extra_skipped_at: "" });
    expect(rows[1]).toMatchObject({ ...times.stopped, extra_finished_at: "" });
    const json = JSON.parse(await download(data, { dataset: "tests", format: "json", withTests: true }));
    expect(json[0]).toMatchObject({ ...times.finished, extra_skipped_at: null });
  });

  it("marks each answer with its round", async () => {
    const rows = await csv(data, { dataset: "answers", withTests: true });
    expect(rows.map((r) => [r.position, r.question_id, r.round])).toEqual([[String(main - 1), `q${main - 1}`, "main"], [String(main), "x-0", "extra"]]);
  });

  it("has its questions as drawn, marked extra and numbered on after the main test, as the answers number them", async () => {
    const rows = (await csv(data, { dataset: "questions", withTests: true })).filter((r) => r.assessment_id === uuid(1));
    const extra = rows.filter((r) => r.round === "extra");
    expect(stored.extra?.length).toBe(8);
    expect(extra.map((r) => r.question_id)).toEqual(stored.extra!.map((q) => q.id));
    expect(extra.map((r) => r.position)).toEqual(stored.extra!.map((_, i) => String(main + i)));
    expect(extra.map((r) => r.index)).toEqual(stored.extra!.map((_, i) => String(i)));
    expect(extra[0]).toMatchObject({ question_id: "x-0", stage: "", route: "", template_id: stored.extra![0].templateId });
    expect(JSON.parse(extra[0].question)).toEqual(stored.extra![0]);
    expect(new Set(rows.filter((r) => r.round !== "extra").map((r) => r.round))).toEqual(new Set(["main"]));
  });
});

describe("the questionnaire answers", () => {
  const child = (n: number, over: Record<string, unknown> = {}) => ({
    id: uuid(2000 + n), created_at: "2026-10-15T09:00:00+00:00", parent_id: uuid(1000 + n), first_name: "Zoë", grade: 4, province: "BC",
    learning_styles: ["visual", "hands-on"], interests: ["animals"], learning_note: "Word problems, and \"tens\"", math_feeling: "avoids",
    learning_goal: "catch_up", weekly_time: "1_to_2h", learning_updated_at: "2026-10-16T11:00:00+00:00", ...over,
  });
  const data = { children: [child(2), child(1, { learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null, learning_updated_at: null })], testFamilies: [uuid(1002)] };

  it("are one row per child, with every answer and null for a question not answered", async () => {
    const rows = await csv(data, { dataset: "questionnaire", withTests: true });
    expect(rows.map((r) => r.id)).toEqual([uuid(2001), uuid(2002)]);
    expect(rows[1]).toMatchObject({ parent_id: uuid(1002), grade: "4", province: "BC", learning_note: 'Word problems, and "tens"', math_feeling: "avoids", learning_goal: "catch_up", weekly_time: "1_to_2h" });
    expect(JSON.parse(rows[1].learning_styles)).toEqual(["visual", "hands-on"]);
    expect(rows[0]).toMatchObject({ learning_styles: "", math_feeling: "", learning_updated_at: "" });
    expect((await csv(data, { dataset: "questionnaire", withTests: false })).map((r) => r.id)).toEqual([uuid(2001)]);
  });

  it("are read a page at a time", async () => {
    const children = Array.from({ length: 2345 }, (_, i) => child(i + 1));
    const { reader, log } = counted({ children });
    let text = "";
    for await (const piece of exportChunks(reader, { dataset: "questionnaire", format: "json", withTests: false })) text += piece;
    expect(JSON.parse(text)).toHaveLength(2345);
    expect(log.most).toBeLessThanOrEqual(1000);
  });
});

describe("every dataset", () => {
  it("has no name, email or postal code: the ids link to the admin pages", async () => {
    const head = async (dataset: ExportRequest["dataset"]) => readCsv((await download({}, { dataset, format: "csv", withTests: false })).slice(1))[0];
    for (const { id } of EXPORT_DATASETS) {
      expect(await head(id)).not.toEqual(expect.arrayContaining([expect.stringMatching(/name|email|postal/)]));
    }
    expect(EXPORT_DATASETS.map((d) => d.id)).toEqual(["tests", "questions", "answers", "question_shows", "facts", "fact_answers", "profiles", "questionnaire"]);
  });
});

/** Each table's columns, as the migrations create and add them (comments left out). */
function migratedColumns(): Map<string, Set<string>> {
  const dir = "supabase/migrations";
  const sql = [readFileSync("supabase/schema.sql", "utf8"), ...readdirSync(dir).sort().map((f) => readFileSync(`${dir}/${f}`, "utf8"))]
    .join("\n").replace(/--.*$/gm, "");
  const tables = new Map<string, Set<string>>();
  const add = (table: string, column: string) => (tables.get(table) ?? tables.set(table, new Set()).get(table)!).add(column.replaceAll('"', ""));
  for (const [, table, body] of sql.matchAll(/create table public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    for (const [, column] of body.matchAll(/^\s+("?\w+"?) (uuid|text|jsonb|smallint|integer|boolean|timestamptz|bigint|numeric)/gm)) add(table, column);
  }
  for (const [, table, body] of sql.matchAll(/alter table public\.(\w+)\s+([\s\S]*?);/g)) {
    for (const [, column] of body.matchAll(/add column ("?\w+"?)/g)) add(table, column);
  }
  return tables;
}

describe("the columns the export reads", () => {
  it("are each made by a migration, so no read asks the database for a column it does not have", async () => {
    const asked: { table: string; columns: readonly string[] }[] = [];
    const inner = memoryExportReader({ assessments: [test(1)], children: [{ id: uuid(2001), parent_id: uuid(1001) }] });
    const reader: ExportReader = {
      testFamilies: inner.testFamilies,
      page: (table, columns, after, limit) => { asked.push({ table, columns }); return inner.page(table, columns, after, limit); },
      ofTests: (table, columns, order, ids) => { asked.push({ table, columns: [...columns, ...order] }); return inner.ofTests(table, columns, order, ids); },
    };
    for (const { id } of EXPORT_DATASETS) { for await (const piece of exportChunks(reader, { dataset: id, format: "json", withTests: true })) void piece; }
    const tables = migratedColumns();
    const missing = asked.flatMap(({ table, columns }) => columns.filter((c) => !tables.get(table)?.has(c)).map((c) => `${table}.${c}`));
    expect(new Set(asked.map((a) => a.table))).toEqual(new Set(["assessments", "children", "answers", "question_shows", "assessment_facts", "fact_answers", "learner_profiles"]));
    expect([...new Set(missing)]).toEqual([]);
    // The extra round (#190): its times on the test and its marker on each answer.
    const read = new Set(asked.flatMap(({ table, columns }) => columns.map((c) => `${table}.${c}`)));
    for (const c of ["assessments.extra_offered_at", "assessments.extra_skipped_at", "assessments.extra_started_at", "assessments.extra_finished_at", "answers.round"]) {
      expect(read).toContain(c);
    }
  });
});
