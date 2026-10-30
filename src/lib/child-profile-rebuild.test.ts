import { describe, expect, it } from "vitest";
import { learnerProfile, type LearnerProfile, type ProfileLearning } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { readChildProfile, rebuildChildProfile, type ChildProfileStore } from "@/lib/child-profile";
import { memoryChildProfiles } from "@/lib/child-profile-memory";
import { learningEvents, type NewLearningEvent } from "@/lib/learning-events";

// The child's profile (#303) through its rebuild entry point and its read, over the in-memory seams: the profile store
// (src/lib/child-profile-memory.ts) and the learning events' store. A rebuild stores the facts as the next revision;
// a rebuild from older inputs never replaces one from newer inputs (compare and set).

const PARENT = "00000000-0000-4000-8000-0000000000a1";
const CHILD = "00000000-0000-4000-8000-0000000000c1";
const OTHER_PARENT = "00000000-0000-4000-8000-0000000000a2";
const OTHER_CHILD = "00000000-0000-4000-8000-0000000000c2";
const WORKBOOK = "00000000-0000-4000-8000-0000000000b1";
const TEST = "00000000-0000-4000-8000-0000000000e1";
const OLD_TEST = "00000000-0000-4000-8000-0000000000e0";

const profileOf = (knows: number): LearnerProfile => {
  const { asked, placement } = takeTest({ grade: 3, province: "BC" }, 7, knowsUpTo(knows));
  return learnerProfile({
    placement,
    answers: asked.map((q) => ({
      question: q, response: q.level <= knows ? q.answer : "no idea", correct: q.level <= knows, misconception: null,
      timeMs: 20_000, work: { required: false, drawing: false, typed: false }, readAloud: null, away: null,
    })),
    help: "no",
    learning: null,
  })!;
};
const NOW = profileOf(2);
const BEFORE = profileOf(1);
const LEARNING: ProfileLearning = { styles: ["pictures"], interests: ["space"], feeling: null, goal: "catch_up", weeklyTime: null };

let n = 0;
const call = (over: Partial<NewLearningEvent> = {}): NewLearningEvent => {
  n += 1;
  return {
    key: `call:${n}`, parentId: PARENT, childId: CHILD, source: "call",
    question: { source: "workbook", workbookId: WORKBOOK, page: 1, question: n },
    skill: { standard: "3.3", skills: [] }, result: "right_with_help", stuckStep: null, mistake: null, hints: 1, timeMs: null,
    occurredAt: `2026-10-29T16:${String(n % 60).padStart(2, "0")}:00.000Z`, evidence: { kind: "call", id: "call-1" }, ...over,
  };
};

function family({ deleting = [] as string[] } = {}) {
  const memory = memoryChildProfiles({
    children: [{ id: CHILD, parentId: PARENT, grade: 3 }, { id: OTHER_CHILD, parentId: OTHER_PARENT, grade: 3 }],
    tests: [
      { id: OLD_TEST, childId: CHILD, completedAt: "2026-09-01T18:00:00.000Z", profile: { ...BEFORE, buildId: "build-old" } },
      { id: TEST, childId: CHILD, completedAt: "2026-10-20T18:00:00.000Z", profile: { ...NOW, buildId: "build-1" } },
    ],
    learning: { [CHILD]: LEARNING },
    deleting,
  });
  return { ...memory, record: learningEvents(memory.events) };
}

describe("the child's profile rebuild", () => {
  it("builds from the latest assessment profile and every event, stores it as the next revision, and reads it back", async () => {
    const f = family();
    expect(await readChildProfile(f.profiles, CHILD)).toBeNull();
    const helped = await f.record.append(call());
    expect(helped.ok).toBe(true);

    const first = await rebuildChildProfile(CHILD, f);
    expect(first).toMatchObject({ built: true, revision: 1 });
    const read = await readChildProfile(f.profiles, CHILD);
    expect(read).toMatchObject({ revision: 1, builtAt: expect.any(String) });
    expect(read?.profile.assessment).toMatchObject({ assessmentId: TEST, buildId: "build-1" });
    expect(read?.profile.preferences).toEqual({ styles: ["pictures"], interests: ["space"] });
    const s33 = read?.profile.standards.find((s) => s.code === "3.3");
    expect(s33?.events.rightWithHelp).toBe(1);
    expect(s33?.evidence.events).toEqual([helped.ok && helped.event.id]);

    await f.record.append(call({ result: "right", hints: 0 }));
    expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2 });
    expect((await readChildProfile(f.profiles, CHILD))?.profile.standards.find((s) => s.code === "3.3")?.events).toMatchObject({ right: 1, rightWithHelp: 1 });
    // One profile per child: the other child has none.
    expect(await readChildProfile(f.profiles, OTHER_CHILD)).toBeNull();
  });

  it("never stores a build from older inputs over a newer one", async () => {
    const f = family();
    await rebuildChildProfile(CHILD, f);
    let raced = false;
    // While this rebuild builds, another one stores a profile with a newer event.
    const racing: ChildProfileStore = {
      ...f.profiles,
      async save(row, expected) {
        if (!raced) {
          raced = true;
          await f.record.append(call({ result: "wrong", mistake: "O3" }));
          expect(await rebuildChildProfile(CHILD, f)).toMatchObject({ built: true, revision: 2 });
        }
        return f.profiles.save(row, expected);
      },
    };
    expect(await rebuildChildProfile(CHILD, { profiles: racing, events: f.events })).toMatchObject({ built: true, revision: 3 });
    const read = await readChildProfile(f.profiles, CHILD);
    expect(read?.revision).toBe(3);
    expect(read?.profile.standards.find((s) => s.code === "3.3")?.events.mistakes).toEqual(["O3"]);

    // A save over a revision that is no longer stored changes nothing.
    expect(await f.profiles.save({ childId: CHILD, parentId: PARENT, assessmentId: TEST, profile: read!.profile }, 1)).toBe("changed");
    expect((await readChildProfile(f.profiles, CHILD))?.revision).toBe(3);
  });

  it("stores nothing for an unknown child, a child with nothing to build from, or a family being deleted", async () => {
    expect(await rebuildChildProfile("00000000-0000-4000-8000-0000000000ff", family())).toEqual({ built: false, reason: "no_child" });
    expect(await rebuildChildProfile(OTHER_CHILD, family())).toEqual({ built: false, reason: "nothing_to_build" });
    const fenced = family({ deleting: [PARENT] });
    expect(await rebuildChildProfile(CHILD, fenced)).toMatchObject({ built: false, reason: "refused" });
    expect(await readChildProfile(fenced.profiles, CHILD)).toBeNull();
  });
});
