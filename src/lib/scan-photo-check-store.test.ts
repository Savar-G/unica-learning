import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { photoCheckClient } from "@/lib/scan-photo-check-store";

describe("the photo check's client (#855)", () => {
  it("is on only with the decision key, makes one try, and ignores the development fake in production", () => {
    expect(photoCheckClient({})).toBeNull();
    expect(photoCheckClient({ OPENROUTER_API_KEY: "sk-or-other" })).toBeNull();
    const live = photoCheckClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d" });
    expect([live?.model, live?.maxAttempts]).toEqual(["typesafe/jev-1.14", 1]);
    // A model outside the pinned table turns the check off instead of failing the preview.
    expect(photoCheckClient({ DECISIONS_OPENROUTER_API_KEY: "sk-or-d", DECISION_MODEL: "someone/else" })).toBeNull();
    expect(photoCheckClient({ NODE_ENV: "production", PHOTO_CHECK_FAKE: "blurry" })).toBeNull();
    expect(photoCheckClient({ NODE_ENV: "development", PHOTO_CHECK_FAKE: "blurry" })?.model).toBe("fake/photo-check");
  });
});

describe("who the photo check's store admits (#856)", () => {
  type Decision = { open: boolean; reason: string };
  async function store(decision: Decision | Error) {
    vi.resetModules();
    vi.doMock("@/lib/scan-marking-access", () => ({ scanChecksDecision: async () => { if (decision instanceof Error) throw decision; return decision; } }));
    const { photoCheckStore } = await import("@/lib/scan-photo-check-store");
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { data: true, error: null }; } };
    return { s: photoCheckStore(db as never, { photo: "ph", env: {} }), calls };
  }
  const result = { state: "unknown", version: 1, model: "m", error: "timeout", ms: 1, at: "t" } as const;

  it("passes the decision to the database as it is: test, families or closed (#953 review)", async () => {
    const test = await store({ open: true, reason: "test_family" });
    expect(await test.s.eligible("pa")).toBe(true);
    await test.s.claim({ parent: "pa", photo: "ph", token: "t" });
    await test.s.finish({ parent: "pa", photo: "ph", token: "t", result });
    expect(test.calls.map((c) => [c.fn, c.args.p_access])).toEqual([["claim_photo_check", "test"], ["finish_photo_check", "test"]]);
    const plan = await store({ open: true, reason: "open" });
    await plan.s.claim({ parent: "pa", photo: "ph", token: "t" });
    await plan.s.finish({ parent: "pa", photo: "ph", token: "t", result });
    expect(plan.calls.map((c) => c.args.p_access)).toEqual(["families", "families"]);
    const ending = await store({ open: true, reason: "ending_until_end" });
    await ending.s.claim({ parent: "pa", photo: "ph", token: "t" });
    expect(ending.calls[0].args.p_access).toBe("families");
  });

  it("admits no one when the decision is closed or cannot be read, and refuses another photo", async () => {
    const closed = await store({ open: false, reason: "not_test_family" });
    expect(await closed.s.eligible("pa")).toBe(false);
    await closed.s.claim({ parent: "pa", photo: "ph", token: "t" });
    // An explicit denial stays a denial: never "test", which the database would admit for a test family.
    expect(closed.calls[0].args.p_access).toBe("closed");
    const off = await store({ open: false, reason: "off" });
    await off.s.finish({ parent: "pa", photo: "ph", token: "t", result });
    expect(off.calls[0].args.p_access).toBe("closed");
    const failed = await store(new Error("read"));
    expect(await failed.s.eligible("pa")).toBe(false);
    await failed.s.claim({ parent: "pa", photo: "ph", token: "t" });
    expect(failed.calls[0].args.p_access).toBe("closed");
    await expect(failed.s.claim({ parent: "pa", photo: "other", token: "t" })).rejects.toThrow(/another photo/);
  });
});
