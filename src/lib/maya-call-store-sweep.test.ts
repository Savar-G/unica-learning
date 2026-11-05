import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import type { Database } from "@/lib/database";
import { sweepCallSource } from "@/lib/maya-call-store";
vi.mock("server-only", () => ({}));

// The sweep's Supabase source (#528) builds its page cursor from the stored times, which hold microseconds.

function fixture(answer: unknown = []) {
  const urls: URL[] = [];
  const bodies: unknown[] = [];
  const db = createClient<Database>("https://fixture.invalid", "key", { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    urls.push(new URL(String(input)));
    if (init?.body) bodies.push(JSON.parse(String(init.body)));
    return Response.json(answer);
  } } });
  return { source: sweepCallSource(db), urls, bodies };
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

it("keeps the sweep's place in each list as the exact stored time and call id (#586)", async () => {
  // Wrong if: the place is stored under another kind, loses its microseconds, or a stored place does not read back.
  const id = "00000000-0000-4000-8000-0000000000aa";
  const at = "2026-11-05T05:21:55.106413+00:00";
  const write = fixture();
  await write.source.writePlace("live", { at, id });
  await write.source.writePlace("unfinished", null);
  expect(write.urls[0].pathname).toBe("/rest/v1/maya_call_sweep_cursors");
  expect(write.urls[0].searchParams.get("on_conflict")).toBe("kind");
  expect(write.bodies[0]).toMatchObject({ kind: "live", at, call_id: id });
  expect(write.bodies[1]).toMatchObject({ kind: "unfinished", at: null, call_id: null });
  await expect(write.source.writePlace("live", { at: "now", id })).rejects.toThrow();

  const read = fixture({ at, call_id: id });
  expect(await read.source.readPlace("live")).toEqual({ at, id });
  expect(read.urls[0].searchParams.get("kind")).toBe("eq.live");
  expect(await fixture(null).source.readPlace("unfinished")).toBeNull();
});
