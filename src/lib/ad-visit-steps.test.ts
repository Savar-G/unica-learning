import { describe, expect, it } from "vitest";
import { adStepRow, markStep, STEPS_STORAGE_KEY, type AdStepPost } from "@/lib/ad-visit-steps";
import { VISIT_STORAGE_KEY, type TabStore } from "@/lib/visit-source";

// A step goes out once per tab, only from a tab with an ad visit ID, and carries only the visit ID and the step name.
const ID = "3f2b8c1e-9d4a-4f6b-8e2c-1a2b3c4d5e6f";

function tab(initial: Record<string, string> = {}, opts: { blocked?: boolean; dropsWrites?: boolean } = {}) {
  const data = new Map(Object.entries(initial));
  const store: TabStore = {
    getItem: (k) => { if (opts.blocked) throw new Error("blocked"); return data.get(k) ?? null; },
    setItem: (k, v) => { if (opts.blocked) throw new Error("blocked"); if (!opts.dropsWrites) data.set(k, v); },
  };
  const sent: AdStepPost[] = [];
  return { store, sent, send: (p: AdStepPost) => void sent.push(p), data };
}

describe("markStep", () => {
  it("sends the visit ID and the step from a tab with an ad visit", () => {
    const t = tab({ [VISIT_STORAGE_KEY]: ID });
    markStep({ step: "start_open", store: t.store, send: t.send });
    expect(t.sent).toEqual([{ visitId: ID, step: "start_open" }]);
  });

  it("sends each step once per tab, and each different step once", () => {
    const t = tab({ [VISIT_STORAGE_KEY]: ID });
    for (const step of ["start_open", "start_open", "form_start", "start_open", "form_start", "code_sent"] as const) markStep({ step, store: t.store, send: t.send });
    expect(t.sent.map((p) => p.step)).toEqual(["start_open", "form_start", "code_sent"]);
  });

  it("sends nothing from a tab that did not come from an ad", () => {
    const t = tab();
    markStep({ step: "start_open", store: t.store, send: t.send });
    expect(t.sent).toEqual([]);
  });

  it("sends nothing when the stored visit ID is not a UUID", () => {
    const t = tab({ [VISIT_STORAGE_KEY]: "not-an-id" });
    markStep({ step: "form_start", store: t.store, send: t.send });
    expect(t.sent).toEqual([]);
  });

  it("sends nothing when storage is blocked or does not keep the record", () => {
    const blocked = tab({ [VISIT_STORAGE_KEY]: ID }, { blocked: true });
    markStep({ step: "start_open", store: blocked.store, send: blocked.send });
    const dropping = tab({ [VISIT_STORAGE_KEY]: ID }, { dropsWrites: true });
    markStep({ step: "start_open", store: dropping.store, send: dropping.send });
    markStep({ step: "start_open", store: dropping.store, send: dropping.send });
    expect(blocked.sent).toEqual([]);
    expect(dropping.sent).toEqual([]);
  });

  it("ignores a damaged record of sent steps and starts it again", () => {
    const t = tab({ [VISIT_STORAGE_KEY]: ID, [STEPS_STORAGE_KEY]: "{oops" });
    markStep({ step: "code_sent", store: t.store, send: t.send });
    expect(t.sent).toEqual([{ visitId: ID, step: "code_sent" }]);
    expect(JSON.parse(t.data.get(STEPS_STORAGE_KEY)!)).toEqual(["code_sent"]);
  });
});

describe("adStepRow", () => {
  it("keeps only the visit ID, in lower case, and a known step", () => {
    expect(adStepRow({ visitId: ID.toUpperCase(), step: "google_start", email: "a@b.c" })).toEqual({ visit_id: ID, step: "google_start" });
  });

  it("refuses an unknown step, a bad visit ID or a body that is not an object", () => {
    for (const body of [{ visitId: ID, step: "card_saved" }, { visitId: "x", step: "start_open" }, { step: "start_open" }, null, [ID], "start_open"]) expect(adStepRow(body)).toBeNull();
  });
});
