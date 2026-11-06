import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { feedbackAdmission, feedbackInput, feedbackSource, sendFeedback } from "@/lib/feedback";
import { MemoryFeedbackStore } from "@/lib/feedback-memory";
const parent = randomUUID(), child = randomUUID(), other = randomUUID();
const input = (extra = {}) => ({ requestId: randomUUID(), childId: null, product: "workbook", text: "More room for working, please.", source: "/account/workbooks", ...extra });
function fixture() { let now = 10000000; const store = new MemoryFeedbackStore(() => now); store.parents.add(parent); store.parents.add(other); store.children.set(child, parent); return { store, advance: (ms: number) => { now += ms; } }; }

describe("parent Feedback public interface", () => {
  it("admits a parent without children or a workbook", async () => {
    const { store } = fixture();
    expect(await sendFeedback(store, other, input())).toEqual({ ok: true });
    expect(store.rows[0].parent).toBe(other);
  });
  it.each(["", " \n\t", "x".repeat(5001)])("refuses empty or oversized input without a write", async text => {
    const { store } = fixture();
    expect(await sendFeedback(store, parent, input({ text }))).toEqual({ ok: false, error: text.length > 5000 ? "too_long" : "empty" });
    expect(store.rows).toHaveLength(0);
  });
  it("counts Unicode characters like Postgres and never truncates", async () => {
    const { store } = fixture();
    expect(await sendFeedback(store, parent, input({ text: "🙂".repeat(5000) }))).toEqual({ ok: true });
    expect(store.rows[0].input.text).toBe("🙂".repeat(5000));
    expect(await sendFeedback(store, parent, input({ text: "🙂".repeat(5001) }))).toEqual({ ok: false, error: "too_long" });
  });
  it("refuses foreign children and child and family deletion, including duplicate attempts", async () => {
    const { store } = fixture(), body = input({ childId: child });
    expect(await sendFeedback(store, other, body)).toEqual({ ok: false, error: "child_unavailable" });
    expect(await sendFeedback(store, parent, body)).toEqual({ ok: true });
    store.deletingChildren.add(child);
    expect(await sendFeedback(store, parent, body)).toEqual({ ok: false, error: "child_unavailable" });
    store.deletingParents.add(parent);
    expect(await sendFeedback(store, parent, input())).toEqual({ ok: false, error: "family_unavailable" });
  });
  it("admits exactly five concurrent new messages and permits an identical retry at the limit", async () => {
    const { store, advance } = fixture(), body = input();
    const results = await Promise.all([body, ...Array.from({ length: 11 }, () => input())].map(b => sendFeedback(store, parent, b)));
    expect(results.filter(r => r.ok)).toHaveLength(5);
    expect(results.filter(r => !r.ok && r.error === "rate_limited")).toHaveLength(7);
    expect(await sendFeedback(store, parent, body)).toEqual({ ok: true });
    expect(await sendFeedback(store, parent, { ...body, text: "A changed message" })).toEqual({ ok: false, error: "conflict" });
    expect(store.rows).toHaveLength(5);
    advance(3600000);
    expect(await sendFeedback(store, parent, input())).toEqual({ ok: true });
  });
  it("deletes only the owned child's rows, then all family rows", async () => {
    const { store } = fixture();
    await sendFeedback(store, parent, input({ childId: child })); await sendFeedback(store, parent, input()); await sendFeedback(store, other, input());
    store.deleteChild(child); expect(store.rows).toHaveLength(2);
    store.deleteFamily(parent); expect(store.rows.map(r => r.parent)).toEqual([other]);
  });
  it("does not turn failed or malformed store results into success", async () => {
    expect(() => feedbackAdmission({ ok: true })).toThrow();
    expect(await sendFeedback({ submit: async () => { throw Error("offline"); } }, parent, input())).toEqual({ ok: false, error: "unavailable" });
    expect(await sendFeedback({ submit: async () => "unknown" as never }, parent, input())).toEqual({ ok: false, error: "unavailable" });
  });
  it.each(["/account/report/secret?token=qr#private", "/account/workbooks/child/answers/book?token=qr", "//evil.test/account", "/tutor/p/qr", "/accounting", "https://evil.test/?token=qr"])("removes tokens and unnecessary identifiers from %s", source => {
    const result = feedbackSource(source);
    expect(result).not.toMatch(/secret|child|book\?|token|qr|private|evil|accounting/);
  });
  it("validates product and ids, and ignores a body-selected actor", async () => {
    expect(feedbackInput(input({ product: "unknown" }))).toEqual({ ok: false, error: "invalid" });
    expect(feedbackInput(input({ childId: "bad" }))).toEqual({ ok: false, error: "invalid" });
    const { store } = fixture(); await sendFeedback(store, parent, input({ parentId: other }));
    expect(store.rows[0].parent).toBe(parent);
  });
});

it("preserves the plain Feedback return through the real sign-in URL sanitizer", async () => {
  const { safeNext } = await import("@/lib/sign-in-link");
  const { FEEDBACK_SIGN_IN } = await import("@/lib/feedback");
  expect(safeNext(new URL(FEEDBACK_SIGN_IN, "https://unicalearning.com").searchParams.get("next"))).toBe("/account/feedback");
});
