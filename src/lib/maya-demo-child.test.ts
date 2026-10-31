import { describe, expect, it } from "vitest";
import { DEMO_NAME, ensureDemoChild } from "@/lib/maya-demo-child";
import { memoryDemoChildStore, type MemoryDemoFamilies } from "@/lib/maya-demo-child-memory";

// The demo child of Maya's admin test calls (#323) through ensureDemoChild, on the in-memory store: it changes only the
// child it made (a marked child), never a test family's own child found by name and shape.

const FAMILY = "family-test";
const NOW = Date.UTC(2026, 9, 31, 12, 0, 0);
const sam = { id: "sam", parentId: FAMILY, firstName: "Sam", grade: 2, province: "BC" };

function setup(families: Partial<MemoryDemoFamilies> = {}) {
  let n = 0;
  const store = memoryDemoChildStore({ testFamilies: [FAMILY], children: [], ...families });
  const run = () => ensureDemoChild(store, FAMILY, { now: NOW, seed: () => 1000 + ++n });
  return { store, run };
}

describe("the demo child", () => {
  it("leaves an unrelated Grade 2 BC Sam with no tests untouched, and makes its own marked child (review round 2)", async () => {
    const { store, run } = setup({ children: [sam] });
    const r = await run();
    expect(r).toMatchObject({ created: true, renamedFrom: null, testCreated: true, child: { firstName: DEMO_NAME, grade: 2, province: "BC" } });
    expect(r.child.id).not.toBe("sam");
    const s = store.state();
    expect(s.children.find((c) => c.id === "sam")).toEqual(sam);
    expect(s.tests.filter((t) => t.childId === "sam")).toEqual([]);
    expect(s.marked).toEqual([r.child.id]);
    expect(s.tests).toEqual([{ id: r.testId, childId: r.child.id }]);
  });

  it("leaves an unmarked Maya Demo untouched too", async () => {
    const demo = { ...sam, id: "old", firstName: "Maya Demo" };
    const { store, run } = setup({ children: [demo] });
    await run();
    expect(store.state().children.find((c) => c.id === "old")).toEqual(demo);
  });

  it("renames the marked child it made before (Sam, or Maya Demo) and keeps its test", async () => {
    for (const old of ["Sam", "Maya Demo"]) {
      const { store, run } = setup({ children: [{ ...sam, id: "made", firstName: old }], marked: ["made"], tests: [{ id: "t1", childId: "made" }] });
      const r = await run();
      expect(r).toMatchObject({ created: false, renamedFrom: old, testCreated: false, testId: "t1", child: { id: "made", firstName: DEMO_NAME } });
      expect(store.state().children).toHaveLength(1);
      expect(store.state().tests).toHaveLength(1);
    }
  });

  it("changes nothing on a second run", async () => {
    const { store, run } = setup({ children: [sam] });
    const first = await run();
    const before = store.state();
    const second = await run();
    expect(second).toMatchObject({ created: false, renamedFrom: null, testCreated: false, testId: first.testId, child: first.child });
    expect(store.state()).toEqual(before);
  });

  it("refuses a family whose own child is already named Iris, and changes nothing", async () => {
    const iris = { ...sam, id: "theirs", firstName: DEMO_NAME };
    const { store, run } = setup({ children: [iris] });
    await expect(run()).rejects.toThrow(/did not make/);
    expect(store.state()).toMatchObject({ children: [iris], tests: [], marked: [] });
  });

  it("does not rename the marked child onto a name the family already uses", async () => {
    const { store, run } = setup({ children: [{ ...sam, id: "made" }, { ...sam, id: "theirs", firstName: DEMO_NAME }], marked: ["made"] });
    await expect(run()).rejects.toThrow(/already has a child named/);
    expect(store.state().children.find((c) => c.id === "made")?.firstName).toBe("Sam");
  });

  it("refuses a family that is not a test family", async () => {
    const store = memoryDemoChildStore({ testFamilies: [], children: [sam] });
    await expect(ensureDemoChild(store, FAMILY, { now: NOW, seed: () => 1 })).rejects.toThrow(/not a test family/);
    expect(store.state().children).toEqual([sam]);
  });

  it("gives the new test a first stage with a question Maya supports, closed 39 days ago", async () => {
    const tests: unknown[] = [];
    const base = memoryDemoChildStore({ testFamilies: [FAMILY], children: [] });
    const store = { ...base, createTest: async (p: string, c: string, t: Parameters<typeof base.createTest>[2]) => (tests.push(t), base.createTest(p, c, t)) };
    let n = 0;
    await ensureDemoChild(store, FAMILY, { now: NOW, seed: () => 1000 + ++n });
    const [t] = tests as { test: { stage1: { templateId: string }[] }; startedAt: string; resumeUntil: string }[];
    expect(t.test.stage1.some((q) => ["2-add-2-digit", "2-subtract-2-digit"].includes(q.templateId))).toBe(true);
    expect(t.resumeUntil).toBe(new Date(NOW - 39 * 86_400_000).toISOString());
    expect(Date.parse(t.startedAt)).toBeLessThan(Date.parse(t.resumeUntil));
  });
});
