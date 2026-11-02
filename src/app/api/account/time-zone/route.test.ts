import { beforeEach, expect, it, vi } from "vitest";

const saved = vi.hoisted(() => ({ timeZone: null as string | null, writes: 0 }));
vi.mock("@/lib/supabase-auth", () => ({
  sessionClient: async () => ({}),
  parentId: async () => "parent-id",
  adminClient: () => ({ from: () => ({ update: (row: { time_zone: string }) => ({ eq: () => ({ is: async () => {
    if (saved.timeZone === null) { saved.timeZone = row.time_zone; saved.writes++; }
    return { error: null };
  } }) }) }) }),
}));
const { POST } = await import("./route");
const save = (timeZone: string) => POST(new Request("https://example.invalid/api/account/time-zone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ timeZone }) }));
beforeEach(() => { saved.timeZone = null; saved.writes = 0; });

it.each([
  ["Canada/East-Saskatchewan", "America/Regina"],
  ["america/rainy_river", "America/Winnipeg"],
  ["America/Thunder_Bay", "America/Toronto"],
])("saves the canonical value for %s", async (id, canonical) => {
  expect((await save(id)).status).toBe(200);
  expect(saved.timeZone).toBe(canonical);
  expect(saved.writes).toBe(1);
});

it("refuses an unlisted ID and preserves an already saved value", async () => {
  expect((await save("Future/Accepted")).status).toBe(400);
  expect(saved.writes).toBe(0);
  saved.timeZone = "America/Regina";
  expect((await save("Canada/Pacific")).status).toBe(200);
  expect(saved.timeZone).toBe("America/Regina");
  expect(saved.writes).toBe(0);
});
