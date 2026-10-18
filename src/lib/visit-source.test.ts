import { describe, expect, it } from "vitest";
import { isAdVisit, keepVisit, SOURCE_STORAGE_KEY, sourceTags, startHref, storedTags, VISIT_STORAGE_KEY, visitSource, type AdVisitPost, type TabStore } from "@/lib/visit-source";

// Which channel a signup keeps: the page's tags, or the ones kept for the tab when the parent came back from Google.

const flyer = "?utm_source=flyer&utm_medium=print&utm_campaign=door-to-door&utm_content=a";
const kept = JSON.stringify(sourceTags(flyer));

describe("the source a signup keeps", () => {
  it("is the referrer and the page's tags", () => {
    expect(visitSource({ search: "?utm_source=reddit&x=1", referrer: "https://www.reddit.com/", stored: null })).toEqual({ referrer: "https://www.reddit.com/", utm_source: "reddit" });
  });

  it("falls back to the tags kept for the tab when the page has none, as after Google sign-in", () => {
    expect(visitSource({ search: "", referrer: "", stored: kept })).toEqual({ utm_source: "flyer", utm_medium: "print", utm_campaign: "door-to-door", utm_content: "a" });
  });

  it("prefers the page's own tags over the kept ones", () => {
    expect(visitSource({ search: "?utm_source=reddit", referrer: "", stored: kept })).toEqual({ utm_source: "reddit" });
  });

  it("ignores a kept value that is not ours", () => {
    expect(visitSource({ search: "", referrer: "", stored: "not json" })).toEqual({});
    expect(visitSource({ search: "", referrer: "", stored: JSON.stringify(["flyer"]) })).toEqual({});
    expect(visitSource({ search: "", referrer: "", stored: JSON.stringify({ utm_source: 5, other: "x" }) })).toEqual({});
  });
});

// Keeping the tags for the tab on whichever page the visitor lands, and counting an ad visit once per tab.
function tab(blocked = false) {
  const items = new Map<string, string>();
  const sent: AdVisitPost[] = [];
  let n = 0;
  const store: TabStore = {
    getItem: (k) => { if (blocked) throw new Error("blocked"); return items.get(k) ?? null; },
    setItem: (k, v) => { if (blocked) throw new Error("blocked"); items.set(k, v); },
  };
  const land = (search: string) => keepVisit({ search, store, newId: () => `00000000-0000-4000-8000-00000000000${++n}`, send: (v) => sent.push(v) });
  const source = (search = "") => visitSource({ search, referrer: "", stored: items.get(SOURCE_STORAGE_KEY) ?? null, visitId: items.get(VISIT_STORAGE_KEY) ?? null });
  return { items, sent, land, source };
}

const meta = "?utm_source=meta&utm_medium=paid&utm_campaign=oct-test&utm_content=photo-led&fbclid=IwAR123";

describe("the tags kept for the tab", () => {
  it("keeps the tags and click IDs of the page the visitor landed on, so a later page without tags still has them", () => {
    const t = tab();
    t.land(meta); // e.g. /our-story?utm_source=meta...
    t.land(""); // then the home page, then /start
    expect(t.source()).toEqual({ utm_source: "meta", utm_medium: "paid", utm_campaign: "oct-test", utm_content: "photo-led", fbclid: "IwAR123", visit_id: "00000000-0000-4000-8000-000000000001" });
  });

  it("keeps the first tagged visit of the tab: a second tagged link does not replace it", () => {
    const t = tab();
    t.land("?utm_source=google&gclid=Cj0K");
    t.land(meta);
    expect(storedTags(t.items.get(SOURCE_STORAGE_KEY) ?? null)).toEqual({ utm_source: "google", gclid: "Cj0K" });
    expect(t.sent).toHaveLength(1);
  });

  it("carries gclid and fbclid on to /start", () => {
    expect(startHref("?utm_source=google&gclid=Cj0K&x=1")).toBe("/start?utm_source=google&gclid=Cj0K");
    expect(startHref("?fbclid=IwAR1")).toBe("/start?fbclid=IwAR1");
  });

  it("counts an ad visit once per tab, with the tags and only whether a click ID was there", () => {
    const t = tab();
    t.land(meta);
    t.land(meta);
    t.land("");
    expect(t.sent).toEqual([{ visitId: "00000000-0000-4000-8000-000000000001", utm_source: "meta", utm_medium: "paid", utm_campaign: "oct-test", utm_content: "photo-led", has_gclid: false, has_fbclid: true }]);
    expect(JSON.stringify(t.sent)).not.toContain("IwAR123");
  });

  it("counts a visit with only a click ID, and one with any utm_source but a flyer", () => {
    const g = tab();
    g.land("?gclid=Cj0K");
    expect(g.sent).toEqual([{ visitId: "00000000-0000-4000-8000-000000000001", has_gclid: true, has_fbclid: false }]);
    const r = tab();
    r.land("?utm_source=reddit");
    expect(r.sent).toHaveLength(1);
  });

  it("leaves a flyer visit as before: tags kept for the signup, no ad visit and no visit ID", () => {
    const t = tab();
    t.land(flyer);
    t.land("");
    expect(t.sent).toEqual([]);
    expect(t.items.has(VISIT_STORAGE_KEY)).toBe(false);
    expect(t.source()).toEqual({ utm_source: "flyer", utm_medium: "print", utm_campaign: "door-to-door", utm_content: "a" });
  });

  it("keeps and counts nothing on a page without tags, or when the tab cannot keep them", () => {
    const t = tab();
    t.land("?x=1");
    expect(t.items.size).toBe(0);
    const off = tab(true);
    off.land(meta);
    expect(off.sent).toEqual([]);
  });

  it("saves only a visit ID that is a real random ID", () => {
    expect(visitSource({ search: "", referrer: "", stored: null, visitId: "not-an-id" })).toEqual({});
    expect(isAdVisit({ utm_source: " Flyer " })).toBe(false);
    expect(isAdVisit({ fbclid: "x" })).toBe(true);
  });
});
