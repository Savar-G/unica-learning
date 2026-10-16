import { beforeEach, describe, expect, it, vi } from "vitest";

// The learning route (#126, #195) and the learner profile (#196): the card is on the report, so the parent answers it
// after the report job built the profile. Once the answers are saved, the route builds the profile of the child's
// latest finished test again, after the response. The parent's session is a fake that updates the parent's own child
// only, as row-level security does; the rebuild is recorded.
vi.mock("server-only", () => ({}));

const CHILD = "7f1c2a4e-1b2c-4d3e-8f90-123456789abc";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

let afterResponse: (() => unknown)[];
let rebuilt: string[];
let updates: { id: string; row: Record<string, unknown> }[];

vi.mock("@/lib/supabase-auth", () => ({
  parentId: async () => "parent-1",
  sessionClient: async () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => ({
        eq: (_: string, id: string) => ({
          select: async () => {
            if (id !== CHILD) return { data: [], error: null };
            updates.push({ id, row });
            return { data: [{ id }], error: null };
          },
        }),
      }),
    }),
  }),
}));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: (task: () => unknown) => void afterResponse.push(task) }));
vi.mock("@/lib/learner-profile", () => ({ rebuildLatestProfile: async (childId: string) => void rebuilt.push(childId) }));

const { POST } = await import("@/app/api/account/learning/route");

const save = (body: unknown) => POST(new Request("https://unica.test/api/account/learning", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
}));
const ANSWERS = { styles: ["pictures"], interests: ["space"], note: "", feeling: "avoids", goal: "catch_up", weeklyTime: "1_to_2h" };

beforeEach(() => {
  afterResponse = [];
  rebuilt = [];
  updates = [];
});

describe("the learning route and the learner profile", () => {
  it("builds the profile of the child's latest finished test again after the answers are saved, after the response", async () => {
    const response = await save({ child: CHILD, ...ANSWERS });
    expect(await response.json()).toEqual({ ok: true });
    expect(updates.map((u) => [u.id, u.row.math_feeling, u.row.learning_goal])).toEqual([[CHILD, "avoids", "catch_up"]]);
    expect(rebuilt).toEqual([]);
    await Promise.all(afterResponse.map((task) => task()));
    expect(rebuilt).toEqual([CHILD]);
  });

  it("builds nothing when nothing was saved: another family's child, or answers that are not offered", async () => {
    expect((await save({ child: OTHER, ...ANSWERS })).status).toBe(404);
    expect((await save({ child: CHILD, ...ANSWERS, goal: "win" })).status).toBe(400);
    expect(afterResponse).toEqual([]);
  });
});
