import { describe, expect, it } from "vitest";
import { pauseQuote } from "@/lib/plan-pause";
const input = { weeks: 2, used: 0, now: Date.parse("2026-10-10T18:00:00Z"), zone: "America/Vancouver", book: { id: "b", number: 1, shippedAt: "2026-10-01T18:00:00Z", deliveredAt: "2026-10-03T18:00:00Z" }, plan: { id: "sub", kind: "trial" as const, chargeAt: "2026-11-02T18:00:00Z" } };
describe("binding pause dates", () => {
  it("moves the next book through shipping day nine", () => {
    expect(pauseQuote(input)).toMatchObject({ ok: true, quote: { targetNumber: 2, earliest: "2026-10-29", latest: "2026-11-14", chargeAt: "2026-11-16T18:00:00.000Z" } });
  });
  it("keeps the next book on day ten, and delays the book after it", () => {
    expect(pauseQuote({ ...input, now: input.now + 86400000 })).toMatchObject({ ok: true, quote: { targetNumber: 3, earliest: "2026-10-15", latest: "2026-10-31", late: true } });
  });
  it.each([0, -1, 1.5, 9, NaN])("refuses invalid weeks %s", weeks => expect(pauseQuote({ ...input, weeks }).ok).toBe(false));
  it("refuses quota above eight and requires delivery", () => {
    expect(pauseQuote({ ...input, used: 7 }).ok).toBe(false);
    expect(pauseQuote({ ...input, book: null }).ok).toBe(false);
  });
  it("uses the local year and the dated Vancouver override", () => {
    expect(pauseQuote({ ...input, now: Date.parse("2027-01-01T06:30:00Z"), plan: { ...input.plan, chargeAt: "2027-01-10T18:00:00Z" } })).toMatchObject({ ok: true, quote: { year: 2026 } });
  });
  it("moves calendar weeks across seasonal clock changes", () => {
    const result = pauseQuote({ ...input, zone: "America/Toronto", plan: { ...input.plan, chargeAt: "2026-10-28T18:00:00Z" } });
    expect(result).toMatchObject({ ok: true, quote: { chargeAt: "2026-11-11T19:00:00.000Z" } });
  });
});

import { confirmPause, previewPause } from "@/lib/plan-pause";
import { memoryPauses } from "@/lib/plan-pause-memory";
const fixture = (used = 0) => memoryPauses({ zone: input.zone, book: input.book, used, mailingWeeks: 0, blocked: false });
const quote = async (f: ReturnType<typeof fixture>, weeks = 2) => {
  const q = await previewPause("p", "c", weeks, input.now, f.seams);
  if (!q.ok) throw Error(q.error);
  return q;
};
describe("pause admission and recovery", () => {
  it("sends once for concurrent duplicate confirmations and preserves the allowance on reload", async () => {
    const f = fixture(), q = await quote(f);
    const results = await Promise.all(Array.from({length: 10}, () => confirmPause("p", "c", 2, q.token, input.now, f.seams)));
    expect(results.filter(r => r.ok).length).toBeGreaterThan(0);
    expect(f.sends()).toBe(1); expect(f.context.used).toBe(2);
    expect(await confirmPause("p", "c", 2, q.token, input.now, f.seams)).toMatchObject({ok:true,state:"applied"});
    expect(f.sends()).toBe(1);
  });
  it("serializes different concurrent requests at the allowance boundary", async () => {
    const f = fixture(5), a = await quote(f, 3), b = await quote(f, 2);
    const result = await Promise.all([confirmPause("p","c",3,a.token,input.now,f.seams), confirmPause("p","c",2,b.token,input.now,f.seams)]);
    expect(result.filter(r=>r.ok)).toHaveLength(1); expect(f.context.used).toBe(8); expect(f.sends()).toBe(1);
  });
  it("keeps the hold after a lost response and rejects unrelated proof, then recovers the matching command", async () => {
    const f=fixture(), q=await quote(f); f.lose();
    expect(await confirmPause("p","c",2,q.token,input.now,f.seams)).toMatchObject({ok:false,error:"pending"});
    expect(f.held()).toBe(true); expect(f.context.used).toBe(2);
    expect(await confirmPause("p","c",2,q.token,input.now+864000000,f.seams)).toMatchObject({ok:false,error:"pending"});
    expect(f.sends()).toBe(1); expect(f.held()).toBe(true);
    f.land(); expect(await confirmPause("p","c",2,q.token,input.now+864000000,f.seams)).toMatchObject({ok:true}); expect(f.held()).toBe(false);
  });
  it("refuses ownership, changed weeks, changed books and a deletion fence before a send", async () => {
    const f=fixture(), q=await quote(f);
    expect(await confirmPause("other","c",2,q.token,input.now,f.seams)).toMatchObject({ok:false,error:"not_found"});
    expect(await confirmPause("p","c",3,q.token,input.now,f.seams)).toMatchObject({ok:false,error:"stale"});
    f.context.book={...input.book,id:"new"};
    expect(await confirmPause("p","c",2,q.token,input.now,f.seams)).toMatchObject({ok:false,error:"stale"});
    f.fence(); expect(await previewPause("p","c",2,input.now,f.seams)).toMatchObject({ok:false,error:"pending"}); expect(f.sends()).toBe(0);
  });
});
