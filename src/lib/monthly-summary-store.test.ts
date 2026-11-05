import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { summaryQuota } from "@/lib/monthly-summary-store";

// The shared count of summary tries on Supabase, against a fake PostgREST: the function it calls and what it sends.
vi.mock("server-only", () => ({}));

function admin(answer: () => Response) {
  const asked: { url: URL; body: unknown }[] = [];
  const client = createClient<never>("https://fixture.invalid", "synthetic-key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    asked.push({ url: new URL(String(input)), body: JSON.parse(String(init?.body ?? "null")) });
    return answer();
  } } }) as never;
  return { asked, client };
}

describe("the summary count on Supabase", () => {
  it("counts one try through the service function, with the parent, 5 tries and 10 minutes", async () => {
    const a = admin(() => Response.json(true));
    expect(await summaryQuota(a.client).claim("parent-1", 0)).toBe(true);
    expect(a.asked).toHaveLength(1);
    expect(a.asked[0].url.pathname).toBe("/rest/v1/rpc/claim_monthly_summary_render");
    expect(a.asked[0].body).toEqual({ p_parent: "parent-1", p_max: 5, p_window_seconds: 600 });
  });
  it("is refused when the function says no", async () => {
    expect(await summaryQuota(admin(() => Response.json(false)).client).claim("parent-1", 0)).toBe(false);
  });
  it("throws when the count fails or there is no secret key, so no render goes uncounted", async () => {
    await expect(summaryQuota(admin(() => Response.json({ message: "boom" }, { status: 500 })).client).claim("parent-1", 0)).rejects.toThrow("summary count");
    await expect(summaryQuota(null).claim("parent-1", 0)).rejects.toThrow("no secret key");
  });
});
