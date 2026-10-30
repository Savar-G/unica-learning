import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createSession, storedTest, type Question, type Route, type StoredTest } from "@/lib/assessment";
import { assessmentQuestionReader } from "@/lib/assessment-questions";
import { memoryAssessmentQuestions } from "@/lib/assessment-questions-memory";
import type { AssessmentQuestionReader } from "@/lib/question-package-assessment";

// The assessment question readers (#298): the Supabase reader and the in-memory reader pass the same tests, through
// the reader's interface. A question of a stored test is read as a question package, "content unavailable" for an
// unsupported template, or not found. The Supabase reader talks to a fake PostgREST that keeps public.assessments rows
// and applies the request's id filter.

const TEST = "00000000-0000-4000-8000-000000000001";
const UNKNOWN = "00000000-0000-4000-8000-000000000009";

const ADD: Question = {
  id: "s1-0", templateId: "2-add-2-digit", level: 2, strand: "O", format: "number", whiteboard: true,
  prompt: "48 + 37 = ?", readAloud: "What is 48 plus 37?", values: { a: 48, b: 37 }, answer: "85",
  wrong: [{ value: "75", misconception: "O3" }, { value: "11", misconception: "operation" }],
};
const SUBTRACT: Question = {
  id: "up-0", templateId: "2-subtract-2-digit", level: 2, strand: "O", format: "number", whiteboard: true,
  prompt: "83 − 46 = ?", readAloud: "What is 83 minus 46?", values: { a: 83, b: 46 }, answer: "37",
  wrong: [{ value: "43", misconception: "O1" }, { value: "47", misconception: "regroup-forget" }],
};

/** A grade 2 test with the addition first in stage 1 and the subtraction first in the up form. */
function grade2Test(): StoredTest {
  const test = storedTest(createSession({ grade: 2, province: "BC" }, 42));
  test.stage1[0] = ADD;
  test.stage2.up[0] = SUBTRACT;
  return test;
}

interface Row { id: string; route: Route | null; test: StoredTest }

/** A fake PostgREST with one table, public.assessments, that answers a select filtered on id. */
function supabase(rows: Row[]): AssessmentQuestionReader {
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname !== "/rest/v1/assessments" || (init?.method ?? "GET") !== "GET") throw new Error(`unexpected ${init?.method} ${url.pathname}`);
    const id = url.searchParams.get("id");
    if (!id?.startsWith("eq.")) throw new Error(`unexpected filter ${url.search}`);
    const hit = rows.filter((r) => r.id === id.slice(3)).map((r) => JSON.parse(JSON.stringify(r)));
    return Response.json(hit);
  } } });
  return assessmentQuestionReader(db);
}

const readers: [string, (rows: Row[]) => AssessmentQuestionReader][] = [
  ["Supabase", supabase],
  ["in memory", (rows) => memoryAssessmentQuestions(rows)],
];

describe.each(readers)("the %s assessment question reader", (_name, reader) => {
  const ref = (questionId: string, assessmentId = TEST) => ({ source: "assessment" as const, assessmentId, questionId });

  it("reads a supported question as its package", async () => {
    const result = await reader([{ id: TEST, route: null, test: grade2Test() }]).question(ref("s1-0"));
    if (result.status !== "found") throw new Error(`expected a package, got ${JSON.stringify(result)}`);
    expect(result.package.ref).toEqual(ref("s1-0"));
    expect(result.package.text).toBe("48 + 37 = ?");
    expect(result.package.answer?.value).toEqual({ type: "number", value: 85 });
    expect(result.package.easierExample?.text).toBe("26 + 7 = ?");
  });

  it("says content unavailable for a question of an unsupported template", async () => {
    const test = grade2Test();
    const other = test.stage1[1];
    expect(other.templateId).not.toMatch(/^2-(add|subtract)-2-digit$/);
    expect(await reader([{ id: TEST, route: null, test }]).question(ref(other.id))).toEqual({
      status: "unavailable", reason: "unsupported-template", detail: `template ${other.templateId} has no question package`,
    });
  });

  it("reads a question of the stage 2 form the test was routed to", async () => {
    const result = await reader([{ id: TEST, route: "up", test: grade2Test() }]).question(ref("up-0"));
    expect(result.status === "found" && result.package.answer?.value).toEqual({ type: "number", value: 37 });
  });

  it("does not find a question of a stage 2 form the child was not given", async () => {
    expect(await reader([{ id: TEST, route: "stay", test: grade2Test() }]).question(ref("up-0"))).toEqual({ status: "not-found" });
    expect(await reader([{ id: TEST, route: null, test: grade2Test() }]).question(ref("up-0"))).toEqual({ status: "not-found" });
  });

  it("does not find a question the test does not have", async () => {
    expect(await reader([{ id: TEST, route: null, test: grade2Test() }]).question(ref("s1-99"))).toEqual({ status: "not-found" });
  });

  it("does not find a test that is not there", async () => {
    const rows = [{ id: TEST, route: null, test: grade2Test() }];
    expect(await reader(rows).question(ref("s1-0", UNKNOWN))).toEqual({ status: "not-found" });
    expect(await reader(rows).question(ref("s1-0", "not-a-test-id"))).toEqual({ status: "not-found" });
  });
});
