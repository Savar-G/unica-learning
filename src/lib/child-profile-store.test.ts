import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { learnerProfile, type LearnerProfile } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { childProfileFacts, type ChildProfileStore } from "@/lib/child-profile";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { childProfileStore } from "@/lib/child-profile-store";

// The child profile's two stores (#303) keep the same rules, through the store's interface: the inputs name the
// stored assessment profile of the child's test that finished last; one profile per child; a save stores the next
// revision only over the revision it expects (compare and set); the family write fence and the foreign key refuse a
// save. The Supabase adapter talks to a fake PostgREST that keeps the rows, applies each request's eq filters, and
// answers as Postgres does (23505 for a stored key, 23503 for a child of another parent, 55000 for the fence).
vi.mock("server-only", () => ({}));

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const FENCED_PARENT = "00000000-0000-4000-8000-0000000000a2";
const FENCED_CHILD = "00000000-0000-4000-8000-0000000000c2";
const OLD = "00000000-0000-4000-8000-0000000000e0";
const NEW = "00000000-0000-4000-8000-0000000000e1";
const UNSCORED = "00000000-0000-4000-8000-0000000000e2";

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

// Three finished tests of the child: an older one with a profile, a newer one with a profile, and the newest, which has
// no profile (not scored against BC). The latest assessment profile is the newer one's.
const TESTS = [
  { id: OLD, completedAt: "2026-09-01T18:00:00.000Z", profile: { ...BASE, buildId: "build-old" } },
  { id: NEW, completedAt: "2026-10-20T18:00:00.000Z", profile: { ...BASE, buildId: "build-new" } },
  { id: UNSCORED, completedAt: "2026-10-25T18:00:00.000Z", profile: null },
];

function fakePostgrest(): ChildProfileStore {
  const tables: Record<string, Record<string, unknown>[]> = {
    children: [
      { id: CHILD, parent_id: PARENT, grade: 3, learning_styles: ["pictures"], interests: [], learning_note: "private note", math_feeling: "avoids", learning_goal: null, weekly_time: null },
      { id: FENCED_CHILD, parent_id: FENCED_PARENT, grade: 3, learning_styles: null, interests: null, learning_note: null, math_feeling: null, learning_goal: null, weekly_time: null },
    ],
    assessments: TESTS.map((t) => ({ id: t.id, child_id: CHILD, status: "completed", completed_at: t.completedAt })),
    learner_profiles: TESTS.filter((t) => t.profile).map((t) => ({ assessment_id: t.id, child_id: CHILD, profile: t.profile })),
    child_profiles: [],
  };
  const fenced = [FENCED_PARENT];
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.replace("/rest/v1/", "");
    const rows = tables[table];
    if (!rows) throw new Error(`unexpected request ${url.pathname}`);
    const filters = [...url.searchParams].filter(([column]) => !["select", "order", "limit"].includes(column));
    if (!filters.every(([, test]) => test.startsWith("eq."))) throw new Error(`unexpected filter ${url.search}`);
    const hit = rows.filter((r) => filters.every(([column, test]) => String(r[column]) === test.slice(3)));
    const pick = (list: Record<string, unknown>[]) => list.map((r) => Object.fromEntries((url.searchParams.get("select") ?? "*").split(",").map((c) => c.trim()).map((c) => [c, r[c]])));
    const one = init?.headers && new Headers(init.headers).get("accept") === "application/vnd.pgrst.object+json";
    const answer = (list: Record<string, unknown>[]) => (one ? (list.length ? Response.json(pick(list)[0]) : Response.json({ code: "PGRST116", message: "0 rows" }, { status: 406 })) : Response.json(pick(list)));
    if (!init?.method || init.method === "GET") return answer(hit);
    if (table !== "child_profiles") throw new Error(`unexpected write ${table}`);
    const body = JSON.parse(String(init.body));
    if (fenced.includes(body.parent_id)) return Response.json({ code: "55000", message: "family_unavailable" }, { status: 400 });
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
    children: [{ id: CHILD, parentId: PARENT, grade: 3 }, { id: FENCED_CHILD, parentId: FENCED_PARENT, grade: 3 }],
    tests: TESTS.map((t) => ({ ...t, childId: CHILD })),
    learning: { [CHILD]: LEARNING },
    deleting: [FENCED_PARENT],
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

  it("stores one profile per child, each save the next revision over the one it expects", async () => {
    const store = open();
    const row = { childId: CHILD, parentId: PARENT, assessmentId: NEW, profile: PROFILE };
    expect(await store.current(CHILD)).toBeNull();
    expect(await store.save(row, 1)).toBe("changed");
    expect(await store.save(row, 0)).toEqual({ revision: 1 });
    expect(await store.save(row, 0)).toBe("changed");
    expect(await store.save(row, 1)).toEqual({ revision: 2 });
    expect(await store.save(row, 1)).toBe("changed");
    expect(await store.current(CHILD)).toEqual({ revision: 2, builtAt: expect.any(String), schemaVersion: 1, profile: PROFILE });
  });

  it("refuses a save for a family being deleted, or a child under another parent", async () => {
    const store = open();
    expect(await store.save({ childId: FENCED_CHILD, parentId: FENCED_PARENT, assessmentId: null, profile: PROFILE }, 0)).toEqual({ refused: expect.any(String) });
    expect(await store.save({ childId: CHILD, parentId: "00000000-0000-4000-8000-0000000000a9", assessmentId: null, profile: PROFILE }, 0)).toEqual({ refused: expect.any(String) });
    expect(await store.current(FENCED_CHILD)).toBeNull();
    expect(await store.current(CHILD)).toBeNull();
  });

  it("asks for a new build when the profile's test is gone (deleted after the inputs were read)", async () => {
    const store = open();
    const GONE = "00000000-0000-4000-8000-0000000000e9";
    expect(await store.save({ childId: CHILD, parentId: PARENT, assessmentId: GONE, profile: PROFILE }, 0)).toBe("changed");
    expect(await store.current(CHILD)).toBeNull();
  });
});
