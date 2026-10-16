import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { learnerProfile, type LearnerProfile, type ProfileAi } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import type { NewProfile } from "@/lib/learner-profile";
import { memoryLearnerProfileStore } from "@/lib/learner-profile-memory";
import { learnerProfileStore } from "@/lib/learner-profile-store";
import type { MemoryReportTables } from "@/lib/report-loading-memory";

// The learner profile's two stores (#196, #197) keep the same rules, through the store's interface: one profile per
// test, a build replaces the one before, and the AI parts are stored only over the build they were written for (compare
// and set), so a late AI answer never undoes a later build. The Supabase adapter talks to a fake PostgREST that keeps
// the rows and applies each request's filters; the in-memory adapter is the tests' (src/lib/learner-profile-memory.ts).
vi.mock("server-only", () => ({}));

const TEST = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const { asked, placement } = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4));
const build = (goal: "keep_up" | null): LearnerProfile => learnerProfile({
  placement,
  answers: asked.map((q) => ({
    question: q, response: q.level <= 4 ? q.answer : "no idea", correct: q.level <= 4, misconception: null,
    timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
  })),
  help: "no",
  learning: goal ? { styles: [], interests: [], feeling: null, goal, weeklyTime: null } : null,
})!;
/** The job's build, before the parent answered the learning card; the card's build, after. */
const BEFORE = build(null);
const AFTER = build("keep_up");
const AI: ProfileAi = { nextChallenge: { model: "fake", value: ["5.1"] } };
const owned = (profile: LearnerProfile, assessmentId = TEST): NewProfile => ({ assessmentId, parentId: "parent-1", childId: "child-1", profile });

/** A row as both stores keep it. */
interface Row { assessmentId: string; parentId: string; childId: string; schemaVersion: number; profile: unknown }

/**
 * A fake PostgREST with one table, public.learner_profiles: the upsert on assessment_id, and an update that changes only
 * the rows that match every eq filter, a JSON field (`profile->>key`) too, and returns them.
 */
function fakePostgrest() {
  const rows: Record<string, unknown>[] = [];
  const value = (row: Record<string, unknown>, column: string) => {
    const [name, key] = column.split("->>");
    const field = row[name];
    return key === undefined ? field : (field as Record<string, unknown>)[key];
  };
  const db = createClient("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname !== "/rest/v1/learner_profiles") throw new Error(`unexpected request ${url.pathname}`);
    const body = JSON.parse(String(init?.body));
    if (init?.method === "POST" && url.searchParams.get("on_conflict") === "assessment_id") {
      for (const row of [body].flat()) {
        const at = rows.findIndex((r) => r.assessment_id === row.assessment_id);
        if (at === -1) rows.push(row);
        else rows[at] = { ...rows[at], ...row };
      }
      return new Response(null, { status: 201 });
    }
    if (init?.method === "PATCH") {
      const filters = [...url.searchParams].filter(([column]) => column !== "select");
      if (!filters.every(([, test]) => test.startsWith("eq."))) throw new Error(`unexpected filter ${url.search}`);
      const hit = rows.filter((r) => filters.every(([column, test]) => String(value(r, column)) === test.slice(3)));
      for (const r of hit) Object.assign(r, body);
      return Response.json(hit.map((r) => ({ assessment_id: r.assessment_id })));
    }
    throw new Error(`unexpected ${init?.method} ${url.search}`);
  } } });
  const read = (): Row[] => rows.map((r) => ({
    assessmentId: r.assessment_id as string, parentId: r.parent_id as string, childId: r.child_id as string, schemaVersion: r.schema_version as number, profile: r.profile,
  }));
  return { store: learnerProfileStore(db), rows: read };
}

function memory() {
  const tables: MemoryReportTables = { assessments: [{ id: TEST }] as MemoryReportTables["assessments"] };
  const { store, rows } = memoryLearnerProfileStore(tables);
  return { store, rows: (): Row[] => rows().map(({ assessmentId, parentId, childId, schemaVersion, profile }) => ({ assessmentId, parentId, childId, schemaVersion, profile })) };
}

describe.each([["Supabase", fakePostgrest], ["in-memory", memory]] as const)("the %s profile store", (_, open) => {
  it("keeps one profile per test: a build replaces the one before, and each build has its own id", async () => {
    const { store, rows } = open();
    const first = await store.save(owned(BEFORE));
    const second = await store.save(owned(AFTER));
    expect(first).toEqual(expect.any(String));
    expect(second).not.toBe(first);
    expect(rows()).toEqual([{ assessmentId: TEST, parentId: "parent-1", childId: "child-1", schemaVersion: 1, profile: { ...AFTER, buildId: second } }]);
  });

  it("stores the AI parts only over the build they were written for", async () => {
    const { store, rows } = open();
    const job = await store.save(owned(BEFORE));
    const card = await store.save(owned(AFTER));
    const cardRow = rows();

    // The job's AI parts, written from the facts before the card: the row holds the card's build, so nothing changes.
    expect(await store.saveAi(owned({ ...BEFORE, ai: AI }), job)).toBe(false);
    expect(rows()).toEqual(cardRow);

    // The card's AI parts land on the card's build.
    expect(await store.saveAi(owned({ ...AFTER, ai: AI }), card)).toBe(true);
    expect(rows()).toEqual([{ assessmentId: TEST, parentId: "parent-1", childId: "child-1", schemaVersion: 1, profile: { ...AFTER, ai: AI, buildId: card } }]);

    // No stored profile for the test: nothing to store over.
    expect(await store.saveAi(owned({ ...AFTER, ai: AI }, OTHER), card)).toBe(false);
    expect(rows()).toHaveLength(1);
  });
});
