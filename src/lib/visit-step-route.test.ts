import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The ad test step route: it answers 204 at once, writes one row after the response, keeps only the visit ID and the
// step, waits once for a visit row that is not there yet, and fails quietly. `after` hands its callback to `pending`.
const inserts: { table: string; row: Record<string, unknown> }[] = [];
let insertErrors: ({ code?: string; message: string } | null)[] = [];
let noClient = false;
let recentCount = 0;
let pending: Promise<unknown> | null = null;
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => Promise<unknown>) => { pending = fn(); } };
});
vi.mock("@/lib/supabase-auth", () => ({
  adminClient: () =>
    noClient ? null : {
      from: (table: string) => ({
        select: () => ({ gte: async () => ({ count: recentCount, error: null }) }),
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, row });
          return { error: insertErrors.shift() ?? null };
        },
      }),
    },
}));
const { POST } = await import("@/app/api/visit/step/route");
const { STEP_RATE_MAX } = await import("@/lib/ad-visit-steps");

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ID = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";
const SAME = { "user-agent": BROWSER, "sec-fetch-site": "same-origin" };
const step = (body: unknown, headers: Record<string, string> = SAME) =>
  POST(new Request("https://unicalearning.com/api/visit/step", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) }));

describe("the ad step route", () => {
  beforeEach(() => {
    inserts.length = 0;
    insertErrors = [];
    noClient = false;
    recentCount = 0;
    pending = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores the visit ID and the step, and nothing else posted", async () => {
    const res = await step({ visitId: ID, step: "form_start", email: "a@b.c", name: "Pat" });
    await pending;
    expect(res.status).toBe(204);
    expect(inserts).toEqual([{ table: "ad_visit_steps", row: { visit_id: ID, step: "form_start" } }]);
  });

  it("does not count a post from another site, a bot, an unknown step or a large body", async () => {
    await step({ visitId: ID, step: "form_start" }, { "user-agent": BROWSER, "sec-fetch-site": "cross-site" });
    await step({ visitId: ID, step: "form_start" }, { "user-agent": "Googlebot/2.1", "sec-fetch-site": "same-origin" });
    await step({ visitId: ID, step: "card_saved" });
    await step({ visitId: ID, step: "form_start", pad: "x".repeat(2000) });
    await step("not json");
    expect(pending).toBeNull();
    expect(inserts).toEqual([]);
  });

  it("waits once when the visit row is not there yet, then stores the step", async () => {
    vi.useFakeTimers();
    insertErrors = [{ code: "23503", message: "fk" }, null];
    await step({ visitId: ID, step: "start_open" });
    await vi.runAllTimersAsync();
    await pending;
    expect(inserts).toHaveLength(2);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("logs, and does not try a third time, when the visit never arrives", async () => {
    vi.useFakeTimers();
    insertErrors = [{ code: "23503", message: "fk" }, { code: "23503", message: "fk" }];
    await step({ visitId: ID, step: "start_open" });
    await vi.runAllTimersAsync();
    await pending;
    expect(inserts).toHaveLength(2);
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("treats a step stored already as counted", async () => {
    insertErrors = [{ code: "23505", message: "dup" }];
    await step({ visitId: ID, step: "code_sent" });
    await pending;
    expect(console.error).not.toHaveBeenCalled();
  });

  it("stops counting past the flood limit, and without a service client", async () => {
    recentCount = STEP_RATE_MAX;
    await step({ visitId: ID, step: "start_open" });
    await pending;
    noClient = true;
    await step({ visitId: ID, step: "start_open" });
    await pending;
    expect(inserts).toEqual([]);
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
