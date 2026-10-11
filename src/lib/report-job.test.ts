import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReportModel } from "@/lib/assessment";
import { knowsUpTo, takeTest } from "@/lib/assessment/scripted-child";
import { runReportJob } from "@/lib/report-job";

vi.mock("server-only", () => ({}));
let db: SupabaseClient;
vi.mock("@/lib/supabase-auth", () => ({ adminClient: () => db }));
vi.mock("@/lib/work-store", () => ({ loadShownWork: async () => [] }));
afterEach(() => vi.unstubAllEnvs());
const placement = takeTest({ grade: 4, province: "BC" }, 101, knowsUpTo(4)).placement;

describe("report job comparison snapshot", () => {
  it("stores only the measured summary and reuses it when a job runs again", async () => {
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("SIGNUP_NOTIFY_EMAIL", "");
    let stored: { id: string; model: ReportModel; questions: number; minutes: number } | null = null;
    let sourceReads = 0;
    const requests: string[] = [];
    db = createClient("https://fixture.invalid", "synthetic-key", { global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").at(-1);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url.pathname}`);
      let result: unknown = [];
      let count: number | undefined;
      if (table === "assessments" && url.searchParams.has("status")) {
        sourceReads++;
        count = 400;
        result = url.searchParams.has("id") ? [] : Array.from({ length: 400 }, (_, i) => ({
          id: String(i).padStart(6, "0"), child_id: `private-child-${i}`, status: "completed", completed_at: "2026-10-10T12:00:00Z",
          placement, parent: { email: "private-parent@family.ca" },
        }));
      } else if (table === "assessments") result = { id: "000000", parent_id: "parent", child_id: "private-child-0", status: "completed", grade: 4, province: "BC", completed_at: "2026-10-10T12:00:00Z", placement, help: "no" };
      else if (table === "reports" && method === "POST") {
        const body = JSON.parse(String(init?.body));
        stored = { id: "report", model: body.model, questions: body.questions, minutes: body.minutes };
        result = [stored];
      } else if (table === "reports" && method === "GET") result = stored;
      else if (table === "parents") result = { name: "Synthetic parent", email: "parent@family.ca" };
      else if (table === "children") result = { first_name: "Synthetic child" };
      return new Response(JSON.stringify(result), { headers: { "content-type": "application/json", ...(count === undefined ? {} : { "content-range": `0-399/${count}` }) } });
    } }, auth: { persistSession: false } });
    await runReportJob("000000", "https://fixture.invalid", { reviewer: null });
    expect(stored).toMatchObject({ model: { comparison: { stage: "percentile", n: 400, percentile: 50 } } });
    expect(sourceReads).toBe(2);
    const snapshot = JSON.stringify(stored);
    for (const secret of ["private-child-", "private-parent@", "stage1", "excludedEmails", "tests"]) expect(snapshot).not.toContain(secret);
    await runReportJob("000000", "https://fixture.invalid", { reviewer: null });
    expect(JSON.stringify(stored)).toBe(snapshot);
    expect(sourceReads).toBe(2);
    expect(requests.filter((r) => r === "POST /rest/v1/reports")).toHaveLength(1);
    expect(requests.every((r) => r.includes("/rest/v1/"))).toBe(true);
  });
});
