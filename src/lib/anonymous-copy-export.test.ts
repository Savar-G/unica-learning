import { beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_FIELDS, anonymousTestCopy, type AnonymousTestCopy } from "@/lib/assessment";
import { anonymousCopiesCsv, anonymousCopiesHref, anonymousCopiesJson, type AnonymousTestRow } from "@/lib/anonymous-copy-export";

// The admins' export of the copies without names (#201, spec #181 story 18): CSV and JSON, test families left out unless
// asked (D-099). The route answers 404 to anyone who is not a live admin.

const copy = (over: Partial<AnonymousTestCopy> = {}): AnonymousTestCopy => ({
  ...anonymousTestCopy({
    id: "source-test", copied: false, testFamily: false, grade: 4, province: "BC", status: "completed", route: "stay", help: "no",
    startedAt: "2026-05-04T10:00:00Z", completedAt: "2026-05-04T10:20:00Z", stored: {
      stage1: [{ id: "s1-0", templateId: "t-choice", level: 4, strand: "N", format: "choice", prompt: "Which is \"biggest\", 7, 70 or 700?", choices: ["7", "70", "700"], values: { a: 7 }, answer: "700", wrong: [] }],
    }, placement: null, device: null,
    answers: [{ position: 0, questionId: "s1-0", templateId: "t-choice", values: { a: 7 }, response: "70", correct: false, misconception: "place-value", timeMs: 8000, shownAt: "2026-05-04T10:00:02Z", answeredAt: "2026-05-04T10:00:10Z" }],
    shows: [{ position: 0, questionId: "s1-0", shownAt: "2026-05-04T10:00:02Z" }, { position: 1, questionId: "s1-1", shownAt: "2026-05-04T10:00:12Z" }],
    facts: null, profile: null, learning: null,
  }),
  ...over,
});
const rows: AnonymousTestRow[] = [
  { id: "copy-a", copy: copy() },
  { id: "copy-test-family", copy: copy({ testFamily: true }) },
];

describe("the export of the copies without names", () => {
  it("JSON: every copy with its random id, test families left out unless asked", () => {
    const out = JSON.parse(anonymousCopiesJson(rows, { includeTestFamilies: false }));
    expect(out).toEqual([{ id: "copy-a", ...rows[0].copy }]);
    expect(JSON.parse(anonymousCopiesJson(rows, { includeTestFamilies: true })).map((r: { id: string }) => r.id)).toEqual(["copy-a", "copy-test-family"]);
  });

  it("CSV: one row per question shown, with the test's columns, quoting text and writing lists and objects as JSON", () => {
    const [header, ...lines] = anonymousCopiesCsv(rows, { includeTestFamilies: false }).trimEnd().split("\r\n");
    const columns = header.split(",");
    expect(columns.slice(0, 2)).toEqual(["copy_id", "copy_version"]);
    expect(columns).toEqual(expect.arrayContaining(["grade", "province", "test_month", "test_family", "status", "route", "duration_ms", "round", "template_id", "response", "correct", "misconception", "time_ms", "shown_at_ms"]));
    expect(columns).toHaveLength(10 + COPY_FIELDS.question.length);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("copy-a,1,4,BC,2026-05,false,completed,stay,no,1200000,0,s1-0,main,t-choice,");
    expect(lines[0]).toContain('"Which is ""biggest"", 7, 70 or 700?"');
    expect(lines[0]).toContain('"[""7"",""70"",""700""]"');
    expect(lines[0]).toContain(",70,false,place-value,8000,");
    // The question shown with no answer has empty cells for what the child did.
    expect(lines[1]).toContain(",1,s1-1,main,");
  });

  it("the export page (#200, D-118) links each file, with test families only when asked", () => {
    expect(anonymousCopiesHref({ format: "csv", withTests: false })).toBe("/api/admin/anonymous-copies?format=csv");
    expect(anonymousCopiesHref({ format: "json", withTests: true })).toBe("/api/admin/anonymous-copies?format=json&test=1");
  });
});

const live = vi.hoisted(() => ({ admin: true, rows: [] as unknown[], reads: 0 }));
vi.mock("@/lib/admin-store", () => ({
  adminSession: async () => (live.admin ? { db: {}, userId: "admin", email: "admin@example.invalid" } : null),
  anonymousTestRows: async () => { live.reads++; return live.rows; },
}));

describe("the export route", () => {
  beforeEach(() => { live.admin = true; live.rows = rows; live.reads = 0; });

  it("answers 404 to anyone who is not an admin, and reads nothing", async () => {
    live.admin = false;
    const { GET } = await import("@/app/api/admin/anonymous-copies/route");
    expect((await GET(new Request("https://unicalearning.com/api/admin/anonymous-copies?format=csv"))).status).toBe(404);
    expect(live.reads).toBe(0);
  });

  it("downloads the CSV or the JSON, never cached", async () => {
    const { GET } = await import("@/app/api/admin/anonymous-copies/route");
    const csv = await GET(new Request("https://unicalearning.com/api/admin/anonymous-copies?format=csv"));
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(csv.headers.get("content-disposition")).toMatch(/^attachment; filename="anonymous-tests-.*\.csv"$/);
    expect(csv.headers.get("cache-control")).toBe("no-store");
    expect(await csv.text()).not.toContain("copy-test-family");
    const json = await GET(new Request("https://unicalearning.com/api/admin/anonymous-copies?format=json&test=1"));
    expect(json.headers.get("content-type")).toMatch(/^application\/json/);
    expect((await json.json()).map((r: { id: string }) => r.id)).toEqual(["copy-a", "copy-test-family"]);
    expect((await GET(new Request("https://unicalearning.com/api/admin/anonymous-copies?format=xml"))).status).toBe(400);
  });
});
