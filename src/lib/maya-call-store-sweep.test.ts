import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { sweepCallSource } from "@/lib/maya-call-store";
vi.mock("server-only", () => ({}));

// The sweep's Supabase source (#528) builds its page cursor from the stored times, which hold microseconds.

function fixture() {
  const urls: URL[] = [];
  const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input) => {
    urls.push(new URL(String(input)));
    return Response.json([]);
  } } });
  return { source: sweepCallSource(db), urls };
}

it("pages after the exact stored time, microseconds kept, so the last row of a page is not read again", async () => {
  // Wrong if: the cursor drops the microseconds (".106Z"), which makes the row at ".106413" come after it again.
  const { source, urls } = fixture();
  const id = "00000000-0000-4000-8000-0000000000aa";
  await source.liveCalls("2026-11-05T06:00:00.000Z", { at: "2026-11-05T05:21:55.106413+00:00", id }, 20);
  await source.unfinishedCalls("2026-11-04T06:00:00.000Z", "2026-11-05T06:00:00.000Z", { at: "2026-11-05T05:21:55.106413+00:00", id }, 20);
  const live = urls[0].searchParams.get("or");
  expect(live).toBe(`(created_at.gt.2026-11-05T05:21:55.106413+00:00,and(created_at.eq.2026-11-05T05:21:55.106413+00:00,id.gt.${id}))`);
  expect(urls[0].searchParams.get("status")).toBe("eq.live");
  const unfinished = urls[1].searchParams.get("or");
  expect(unfinished).toContain("ended_at.gt.2026-11-05T05:21:55.106413+00:00");
  expect(unfinished).toContain("live.not.is.null");
  expect(urls[1].searchParams.get("updated_at")).toBe("lte.2026-11-05T06:00:00.000Z");
});

it("refuses a cursor that is not a stored time and an id", async () => {
  // Wrong if: a malformed cursor reaches the filter text.
  const { source, urls } = fixture();
  await expect(source.liveCalls("2026-11-05T06:00:00.000Z", { at: "2026-11-05),id.gt.(", id: "x" }, 20)).rejects.toThrow();
  expect(urls).toHaveLength(0);
});
