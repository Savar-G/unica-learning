import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { childProfileFacts, rebuildChildProfile, type ChildProfileStore } from "@/lib/child-profile";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { childProfileStore } from "@/lib/child-profile-store";

// The child profile's two stores (#303) keep the same rules, through the store's interface: the inputs name the
// stored assessment profile of the child's test that finished last; one profile per child; a save stores the next
// revision only over the revision it expects (compare and set); the family write fence and the foreign key refuse a
// save. The Supabase adapter talks to a fake PostgREST that keeps the rows, applies each request's eq filters, and
// answers as Postgres does, in the live order: the family write fence trigger first (55000 family_unavailable; 55000
// family_scope for a test of another family or a test that no longer exists), then the foreign keys (23503), then the
// primary key (23505). It also keeps PostgREST's row limit (MAX_ROWS), so a reader that asks for one page gets a cut list.
vi.mock("server-only", () => ({}));

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const FENCED_PARENT = "00000000-0000-4000-8000-0000000000a2";
const FENCED_CHILD = "00000000-0000-4000-8000-0000000000c2";
const OLD = "00000000-0000-4000-8000-0000000000e0";
const NEW = "00000000-0000-4000-8000-0000000000e1";
const UNSCORED = "00000000-0000-4000-8000-0000000000e2";
const OTHER_PARENT = "00000000-0000-4000-8000-0000000000a3";
const OTHER_CHILD = "00000000-0000-4000-8000-0000000000c3";
const OTHER_TEST = "00000000-0000-4000-8000-0000000000e3";
const PENDING = "00000000-0000-4000-8000-0000000000e4";
const GONE = "00000000-0000-4000-8000-0000000000e9";

const { asked, placement } = takeTest({ grade: 3, province: "BC" }, 7, knowsUpTo(2));
const BASE: LearnerProfile = learnerProfile({
  placement,
  answers: asked.map((q) => ({
    question: q, response: q.level <= 2 ? q.answer : "no idea", correct: q.level <= 2, misconception: null,
    timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  })),
  help: "no",
  learning: null,
})!;
const PROFILE = childProfileFacts({ grade: 3, learning: null, assessment: { assessmentId: NEW, completedAt: null, buildId: null, profile: BASE }, events: [] })!;
const LEARNING = { styles: ["pictures" as const], interests: [], feeling: "avoids" as const, goal: null, weeklyTime: null };

// Four finished tests of the child: the oldest, with a profile and no report yet; an older one with a profile, a newer
// one with a profile, and the newest, which has no profile (not scored against BC). The latest assessment profile is the
// newer one's.
const TESTS = [
  { id: PENDING, completedAt: "2026-08-01T18:00:00.000Z", profile: { ...BASE, buildId: "build-pending" }, unreliable: false, reported: false },
  { id: OLD, completedAt: "2026-09-01T18:00:00.000Z", profile: { ...BASE, buildId: "build-old" }, unreliable: true },
  { id: NEW, completedAt: "2026-10-20T18:00:00.000Z", profile: { ...BASE, buildId: "build-new" }, unreliable: false },
  { id: UNSCORED, completedAt: "2026-10-25T18:00:00.000Z", profile: null, unreliable: false },
];

// The child's workbooks: an older shipped one, the latest shipped one (a standard twice), and a newer draft.
const WORKBOOKS = [
  { id: "00000000-0000-4000-8000-0000000000b1", number: 1, status: "shipped" as const, standards: ["3.1"] },
  { id: "00000000-0000-4000-8000-0000000000b2", number: 2, status: "shipped" as const, standards: ["3.2", "3.3", "3.2"] },
  { id: "00000000-0000-4000-8000-0000000000b3", number: 3, status: "draft" as const, standards: ["3.6"] },
];

/** PostgREST's row limit: it answers at most this many rows, with no error. */
const MAX_ROWS = 1000;

function fakePostgrest(history: Record<string, unknown>[] = []): ChildProfileStore {
  const tables: Record<string, Record<string, unknown>[]> = {
    children: [
      { id: CHILD, parent_id: PARENT, grade: 3, learning_styles: ["pictures"], interests: [], learning_note: "private note", math_feeling: "avoids", learning_goal: null, weekly_time: null },
      { id: FENCED_CHILD, parent_id: FENCED_PARENT, grade: 3, learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null },
      { id: OTHER_CHILD, parent_id: OTHER_PARENT, grade: 4, learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null },
    ],
    assessments: [
      ...TESTS.map((t) => ({ id: t.id, child_id: CHILD, parent_id: PARENT, status: "completed", completed_at: t.completedAt })),
      { id: OTHER_TEST, child_id: OTHER_CHILD, parent_id: OTHER_PARENT, status: "completed", completed_at: "2026-10-01T18:00:00.000Z" },
    ],
    learner_profiles: TESTS.filter((t) => t.profile).map((t) => ({ assessment_id: t.id, child_id: CHILD, profile: t.profile })),
    // The older test's report has the reliability note; the newer test's does not; the oldest has none yet.
    reports: TESTS.filter((t) => t.reported !== false).map((t) => ({ assessment_id: t.id, child_id: CHILD, model: t.unreliable ? { reliability: { veryFast: 28, answers: 42 } } : {} })),
    child_profiles: [],
    workbooks: WORKBOOKS.map((w) => ({ id: w.id, child_id: CHILD, number: w.number, status: w.status })),
    workbook_questions: WORKBOOKS.flatMap((w) => w.standards.map((standard) => ({ workbook_id: w.id, package: { skill: { standard } } }))),
  };
  // The caller's own list: a test reads what a save sent.
  tables.skill_state_history = history;
  const fenced = [FENCED_PARENT];
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    // A request whose signal is aborted fails as fetch fails.
    if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    if (table === "rpc/scan_marking_command") {
      const args = JSON.parse(String(init?.body));
      if (args.p_action === "revision") return Response.json(0);
      if (args.p_action === "effective") return Response.json([]);
      throw new Error("unexpected marking command");
    }
    // public.save_child_profile_and_skill_changes_from_tests: the profile as a save stores it, then its rows, or neither;
    // nothing when a test the rows came from no longer exists.
    if (table === "rpc/save_child_profile_and_skill_changes_from_tests" || table === "rpc/save_marked_child_profile") {
      const { p_child, p_parent, p_assessment, p_expected, p_schema_version, p_profile, p_changes, p_tests } = JSON.parse(String(init?.body));
      if (fenced.includes(p_parent)) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
      if (!(p_tests as string[]).every((id) => tables.assessments.some((t) => t.id === id && t.child_id === p_child && t.parent_id === p_parent))) return Response.json(null);
      if (p_assessment && tables.assessments.find((t) => t.id === p_assessment)?.parent_id !== p_parent) return Response.json({ code: "55000", message: "family_scope" }, { status: 400 });
      const row = { parent_id: p_parent, assessment_id: p_assessment, build_token: crypto.randomUUID(), schema_version: p_schema_version, profile: p_profile, built_at: new Date().toISOString() };
      let revision = 1;
      if (p_expected === null) {
        if (!tables.children.some((c) => c.id === p_child && c.parent_id === p_parent)) return Response.json({ code: "23503", message: 'insert or update on table "child_profiles" violates foreign key constraint "child_profiles_child_id_parent_id_fkey"' }, { status: 409 });
        if (tables.child_profiles.some((r) => r.child_id === p_child)) return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
        tables.child_profiles.push({ ...row, child_id: p_child, revision });
      } else {
        const stored = tables.child_profiles.find((r) => r.child_id === p_child && r.build_token === p_expected);
        if (!stored) return Response.json(null);
        revision = Number(stored.revision) + 1;
        Object.assign(stored, row, { revision });
      }
      const nextId = () => Math.max(0, ...tables.skill_state_history.map((r) => Number(r.id))) + 1;
      for (const c of p_changes as Record<string, unknown>[]) tables.skill_state_history.push({ id: nextId(), child_id: p_child, ...c });
      return Response.json({ revision, build_token: row.build_token });
    }
    const rows = tables[table];
    if (!rows) throw new Error(`unexpected request ${url.pathname}`);
    const filters = [...url.searchParams].filter(([column]) => !["select", "order", "limit"].includes(column));
    if (!filters.every(([, test]) => /^(eq|gt)\./.test(test))) throw new Error(`unexpected filter ${url.search}`);
    const hit = rows.filter((r) => filters.every(([column, test]) => (test.startsWith("gt.") ? Number(r[column]) > Number(test.slice(3)) : String(r[column]) === test.slice(3))));
    if (url.searchParams.get("order") === "number.desc") hit.sort((a, b) => Number(b.number) - Number(a.number));
    if (url.searchParams.get("order") === "id.asc") hit.sort((a, b) => Number(a.id) - Number(b.id));
    if (url.searchParams.has("limit")) hit.splice(Number(url.searchParams.get("limit")));
    hit.splice(MAX_ROWS);
    const cell = (r: Record<string, unknown>, c: string) => (c === "standard:package->skill->>standard" ? ["standard", (r.package as { skill: { standard: string } }).skill.standard] : c === "reliability:model->reliability" ? ["reliability", (r.model as { reliability?: unknown }).reliability ?? null] : [c, r[c]]);
    const pick = (list: Record<string, unknown>[]) => list.map((r) => Object.fromEntries((url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim()).map((c) => cell(r, c))));
    const one = init?.headers && new Headers(init.headers).get("accept") === "application/vnd.pgrst.object+json";
    const answer = (list: Record<string, unknown>[]) => (one ? (list.length ? Response.json(pick(list)[0]) : Response.json({ code: "PGRST116", message: "0 rows" }, { status: 406 })) : Response.json(pick(list)));
    if (!init?.method || init.method === "GET") return answer(hit);
    if (table !== "child_profiles") throw new Error(`unexpected write ${table}`);
    const body = JSON.parse(String(init.body));
    // The family write fence trigger runs before the keys: a test that no longer exists has no parent, so it is out
    // of the family's scope too.
    if (fenced.includes(body.parent_id)) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
    if (body.assessment_id && tables.assessments.find((t) => t.id === body.assessment_id)?.parent_id !== body.parent_id) return Response.json({ code: "55000", message: "family_scope" }, { status: 400 });
    if (init.method === "POST") {
      if (!tables.children.some((c) => c.id === body.child_id && c.parent_id === body.parent_id)) return Response.json({ code: "23503", message: 'insert or update on table "child_profiles" violates foreign key constraint "child_profiles_child_id_parent_id_fkey"' }, { status: 409 });
      if (body.assessment_id && !tables.assessments.some((t) => t.id === body.assessment_id && t.child_id === body.child_id)) return Response.json({ code: "23503", message: 'insert or update on table "child_profiles" violates foreign key constraint "child_profiles_assessment_id_child_id_fkey"' }, { status: 409 });
      if (rows.some((r) => r.child_id === body.child_id)) return Response.json({ code: "23505", message: "duplicate key" }, { status: 409 });
      rows.push(body);
      return answer([body]);
    }
    if (init.method === "PATCH") {
      for (const r of hit) Object.assign(r, body);
      return answer(hit);
    }
    throw new Error(`unexpected ${init.method}`);
  } } });
  return childProfileStore(db);
}

function memory(): ChildProfileStore {
  return memoryChildProfiles({
    children: [{ id: CHILD, parentId: PARENT, grade: 3 }, { id: FENCED_CHILD, parentId: FENCED_PARENT, grade: 3 }, { id: OTHER_CHILD, parentId: OTHER_PARENT, grade: 4 }],
    tests: [...TESTS.map((t) => ({ ...t, childId: CHILD })), { id: OTHER_TEST, childId: OTHER_CHILD, completedAt: "2026-10-01T18:00:00.000Z", profile: null }],
    learning: { [CHILD]: LEARNING },
    deleting: [FENCED_PARENT],
    workbooks: WORKBOOKS.map((w) => ({ ...w, childId: CHILD })),
  }).profiles;
}

describe.each([["Supabase", fakePostgrest], ["in-memory", memory]] as const)("the %s child profile store", (_, open) => {
  it("gives the child's parent, grade, card answers and latest stored assessment profile", async () => {
    const store = open();
    const inputs = await store.inputs(CHILD);
    expect(inputs).toMatchObject({ parentId: PARENT, grade: 3, learning: LEARNING });
    expect(inputs?.assessment).toEqual({ assessmentId: NEW, completedAt: expect.stringMatching(/^2026-10-20T18:00:00/), buildId: "build-new", profile: { ...BASE, buildId: "build-new" } });
    expect(await store.inputs("00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });

  it("stores one profile per child, each save over the build it expects, with a new build token and the next revision", async () => {
    const store = open();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE };
    expect(await store.current(CHILD)).toBeNull();
    expect(await store.save(row, { revision: 1, buildToken: "00000000-0000-4000-8000-000000000001" })).toBe("changed");
    const saved = await store.save(row, null);
    expect(saved).toEqual({ revision: 1, buildToken: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const first = (await store.current(CHILD))!;
    // The save gives the token it stored: the findings' save of #304 expects it.
    expect(first.buildToken).toBe(typeof saved === "object" && "buildToken" in saved && saved.buildToken);
    expect(await store.save(row, null)).toBe("changed");
    const again = await store.save(row, first);
    expect(again).toEqual({ revision: 2, buildToken: expect.any(String) });
    const second = (await store.current(CHILD))!;
    expect(second.buildToken).toBe(typeof again === "object" && "buildToken" in again && again.buildToken);
    expect(second.buildToken).not.toBe(first.buildToken);
    // The same revision with an older build token is another build: nothing is stored over it.
    expect(await store.save(row, { revision: 2, buildToken: first.buildToken })).toBe("changed");
    expect(await store.current(CHILD)).toEqual({ revision: 2, buildToken: second.buildToken, builtAt: expect.any(String), schemaVersion: 2, profile: PROFILE });
  });

  it("refuses a save for a family being deleted, or a child under another parent", async () => {
    const store = open();
    expect(await store.save({ childId: FENCED_CHILD, parentId: FENCED_PARENT, assessmentId: null, profile: PROFILE }, null)).toEqual({ refused: expect.any(String) });
    expect(await store.save({ childId: CHILD, parentId: "00000000-0000-4000-8000-0000000000a9", assessmentId: null, profile: PROFILE }, null)).toEqual({ refused: expect.any(String) });
    // A test of another family is out of the family's scope (55000 family_scope): refused, not built again.
    expect(await store.save({ childId: CHILD, parentId: PARENT, assessmentId: OTHER_TEST, profile: PROFILE }, null)).toEqual({ refused: expect.stringContaining("family_scope") });
    expect(await store.current(FENCED_CHILD)).toBeNull();
    expect(await store.current(CHILD)).toBeNull();
  });

  it("gives the skill states every finished test with a stored profile and a report, and the latest shipped workbook's standards", async () => {
    const store = open();
    const inputs = await store.skillInputs(CHILD);
    expect(inputs.tests.map((t) => t.assessmentId).sort()).toEqual([OLD, NEW]);
    expect(inputs.tests.find((t) => t.assessmentId === OLD)?.unreliable).toBe(true);
    expect(inputs.tests.find((t) => t.assessmentId === NEW)).toEqual({ assessmentId: NEW, completedAt: expect.stringMatching(/^2026-10-20T18:00:00/), unreliable: false, profile: expect.objectContaining({ buildId: "build-new" }) });
    expect([...new Set(inputs.workbookStandards)].sort()).toEqual(["3.2", "3.3"]);
    expect(await store.skillInputs(OTHER_CHILD)).toEqual({ tests: [], workbookStandards: [], history: [] });
  });

  it("stores a build and its history rows together, in order, or neither", async () => {
    const store = open();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE };
    const mastered = { standard: "3.3", state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: "2026-10-01T18:00:00.000Z" } as const;
    const failed = { standard: "3.3", state: "needs_review", reason: "failed_review", evidence: "test", evidenceAt: "2026-10-20T18:00:00.000Z" } as const;
    const quiet = { standard: "3.4", state: "working_on", reason: "in_workbook", evidence: "workbook", evidenceAt: null } as const;
    const history = async () => (await store.skillInputs(CHILD)).history;
    const asRow = ({ standard, state }: typeof mastered | typeof failed | typeof quiet) => ({ standard, state });
    const rows = (...list: (typeof mastered | typeof failed | typeof quiet)[]) => ({ rows: list, tests: [OLD, NEW] });

    expect(await store.save({ ...row, skillChanges: rows(mastered) }, { revision: 1, buildToken: "00000000-0000-4000-8000-000000000001" })).toBe("changed");
    expect(await history()).toEqual([]);

    const first = await store.save({ ...row, skillChanges: rows(mastered, quiet) }, null);
    expect(first).toEqual({ revision: 1, buildToken: expect.stringMatching(/^[0-9a-f-]{36}$/) });
    const stored = (await store.current(CHILD))!;
    expect(stored.buildToken).toBe(typeof first === "object" && "buildToken" in first && first.buildToken);
    expect(stored.profile).toEqual(PROFILE);
    expect(await history()).toEqual([asRow(mastered), asRow(quiet)]);

    // A second first save, and a save over a build that is not the stored one, write no row.
    expect(await store.save({ ...row, skillChanges: rows(failed) }, null)).toBe("changed");
    expect(await store.save({ ...row, skillChanges: rows(failed) }, { revision: 1, buildToken: "00000000-0000-4000-8000-000000000001" })).toBe("changed");
    expect(await history()).toEqual([asRow(mastered), asRow(quiet)]);

    expect(await store.save({ ...row, skillChanges: rows(failed) }, stored)).toEqual({ revision: 2, buildToken: expect.any(String) });
    expect(await history()).toEqual([asRow(mastered), asRow(quiet), asRow(failed)]);
    expect((await store.current(CHILD))?.buildToken).not.toBe(stored.buildToken);

    // The same refusals as a plain save, with no row.
    expect(await store.save({ ...row, childId: FENCED_CHILD, parentId: FENCED_PARENT, assessmentId: null, skillChanges: { rows: [mastered], tests: [] } }, null)).toEqual({ refused: expect.stringContaining("family_unavailable") });
    expect(await store.save({ ...row, parentId: "00000000-0000-4000-8000-0000000000a9", assessmentId: null, skillChanges: { rows: [mastered], tests: [] } }, null)).toEqual({ refused: expect.any(String) });
    expect(await store.save({ ...row, assessmentId: GONE, skillChanges: { rows: [mastered], tests: [] } }, (await store.current(CHILD))!)).toBe("changed");
    expect(await history()).toHaveLength(3);
    expect((await store.skillInputs(FENCED_CHILD)).history).toEqual([]);
  });

  it("stores neither the build nor its rows when a test the rows came from is gone, though the build token and the profile's test are good", async () => {
    const store = open();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE };
    const mastered = { standard: "3.3", state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: "2026-09-01T18:00:00.000Z" } as const;
    expect(await store.save({ ...row, skillChanges: { rows: [mastered], tests: [GONE, NEW] } }, null)).toBe("changed");
    expect(await store.current(CHILD)).toBeNull();
    const built = await store.save(row, null);
    expect(built).toMatchObject({ revision: 1 });
    const stored = (await store.current(CHILD))!;
    expect(await store.save({ ...row, skillChanges: { rows: [mastered], tests: [GONE] } }, stored)).toBe("changed");
    expect((await store.current(CHILD))?.buildToken).toBe(stored.buildToken);
    expect((await store.skillInputs(CHILD)).history).toEqual([]);
    // Another child's test is not one of this child's.
    expect(await store.save({ ...row, skillChanges: { rows: [mastered], tests: [OTHER_TEST] } }, stored)).toBe("changed");
    expect(await store.save({ ...row, skillChanges: { rows: [mastered], tests: [OLD, NEW] } }, stored)).toEqual({ revision: 2, buildToken: expect.any(String) });
    expect((await store.skillInputs(CHILD)).history).toEqual([{ standard: "3.3", state: "mastered" }]);
  });

  // R345-1: the live fence trigger answers 55000 family_scope for a test that no longer exists, before the foreign key.
  it("asks for a new build when the profile's test is gone (deleted after the inputs were read)", async () => {
    const store = open();
    expect(await store.save({ childId: CHILD, parentId: PARENT, assessmentId: GONE, profile: PROFILE }, null)).toBe("changed");
    expect(await store.current(CHILD)).toBeNull();
    expect(await store.save({ childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE }, null)).toEqual({ revision: 1, buildToken: expect.any(String) });
    expect(await store.save({ childId: CHILD, parentId: PARENT, assessmentId: GONE, profile: PROFILE }, (await store.current(CHILD))!)).toBe("changed");
    expect((await store.current(CHILD))?.revision).toBe(1);
  });
});

describe("the Supabase child profile store's history", () => {
  /** Synthetic rows of one standard, in id order, starting and ending on a known state. */
  const rows = (count: number) => Array.from({ length: count }, (_, i) => ({ id: i + 1, child_id: CHILD, standard: "3.3", state: i % 2 ? "needs_review" : "mastered", evidence_at: null }));

  it.each([999, 1000, 1001, 2000, 2501])("reads all %i rows, in order, past PostgREST's limit", async (count) => {
    const { history } = await fakePostgrest(rows(count)).skillInputs(CHILD);
    expect(history).toHaveLength(count);
    expect(history.every((r, i) => r.state === (i % 2 ? "needs_review" : "mastered"))).toBe(true);
  });

  it("keeps the rebuild's history working past 1000 rows: it adds what changed, then nothing", async () => {
    const history = rows(1501);
    const seams = { profiles: fakePostgrest(history), events: memoryChildProfiles({ children: [{ id: CHILD, parentId: PARENT, grade: 3 }] }).events };
    expect(await rebuildChildProfile(CHILD, seams)).toMatchObject({ built: true, skillStates: { outcome: "recorded" } });
    const added = history.length;
    expect(await rebuildChildProfile(CHILD, seams)).toMatchObject({ built: true, skillStates: { outcome: "recorded", changes: 0 } });
    expect(history).toHaveLength(added);
  });

  it("sends each row's evidence time and the tests it came from", async () => {
    const history: Record<string, unknown>[] = [];
    const store = fakePostgrest(history);
    const change = { standard: "3.3", state: "mastered", reason: "secure_on_test", evidence: "test", evidenceAt: "2026-09-01T18:00:00.000Z" } as const;
    await store.save({ childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE, skillChanges: { rows: [change], tests: [OLD] } }, null);
    expect(history).toEqual([expect.objectContaining({ standard: "3.3", state: "mastered", reason: "secure_on_test", evidence: "test", evidence_at: change.evidenceAt })]);
  });
});

// R355-2: the findings' deadline aborts the save's request.
describe("the Supabase child profile store's save", () => {
  it("sends the abort signal with the request: an aborted save stores nothing", async () => {
    const store = fakePostgrest();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE };
    await expect(store.save(row, null, AbortSignal.abort())).rejects.toThrow(/abort/i);
    expect(await store.current(CHILD)).toBeNull();
    expect(await store.save(row, null, new AbortController().signal)).toEqual({ revision: 1, buildToken: expect.any(String) });
  });
});
