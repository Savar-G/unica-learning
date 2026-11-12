import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { DecisionError, type DecisionErrorKind } from "@/lib/decision-client";
import { fakeDecisionClient, noul } from "@/lib/decision-client-fake";
import { memoryPhotoCheckStore } from "@/lib/scan-photo-check-memory";
import {
  PHOTO_CHECK_THRESHOLDS,
  PHOTO_CHECK_VERSION,
  chooseThreshold,
  claimPhotoCheck,
  photoCheckImage,
  photoCheckView,
  runPhotoCheck,
} from "@/lib/scan-photo-check";

// The photo check (#855) through the fake decision client and the in-memory store: a problem, a clean page, every error
// kind, test families only, one claim per photo, and the threshold rule.
const FAMILY = "family-test", OTHER = "family-real", PHOTO = "photo-1", TOKEN = "00000000-0000-4000-8000-0000000000aa";
const page = (width = 1275, height = 1650) => sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).jpeg().toBuffer().then((b) => new Uint8Array(b));

async function setup(o: { parent?: string; straight?: Uint8Array | null } = {}) {
  const mem = memoryPhotoCheckStore({ eligible: [FAMILY] });
  mem.photos.set(PHOTO, { parent: o.parent ?? FAMILY, state: "saved", sent: false, check: null, straight: o.straight === undefined ? await page() : o.straight });
  return mem;
}
const ref = (parent = FAMILY) => ({ parent, photo: PHOTO });

describe("the photo check (#855)", () => {
  it("a blurry page: done, the problem is blurry, and the parent's view shows only that", async () => {
    // Disproved if a P(blurry) at the threshold does not give the problem, or the view leaks the token or the values.
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(PHOTO_CHECK_THRESHOLDS.blurry!) }), usd: 0.0002 });
    expect(await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN })).toBe(true);
    expect(photoCheckView(mem.photos.get(PHOTO)!.check)).toEqual({ state: "pending" });
    const result = await runPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    expect(result).toMatchObject({ state: "done", problem: "blurry", version: PHOTO_CHECK_VERSION, model: "typesafe/jev-1.14", probabilities: { blurry: 0.5 }, usd: 0.0002 });
    expect(mem.photos.get(PHOTO)!.check).toEqual(result);
    expect(photoCheckView(mem.photos.get(PHOTO)!.check)).toEqual({ state: "done", problem: "blurry" });
    // One request: the context text and the page as a JPEG within Jev's limits, asking only the questions with a threshold.
    expect(client.requests).toHaveLength(1);
    const [text, image] = client.requests[0].input;
    expect(text.type).toBe("text");
    expect(Object.keys(client.requests[0].questions)).toEqual(["blurry"]);
    if (image.type !== "image") throw new Error("no image");
    expect(image.mediaType).toBe("image/jpeg");
    expect(await sharp(image.data).metadata()).toMatchObject({ width: 1212, height: 1568 });
  });

  it("a clear page: done with no problem", async () => {
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.04) }) });
    await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN })).toMatchObject({ state: "done", problem: null });
    expect(photoCheckView(mem.photos.get(PHOTO)!.check)).toEqual({ state: "done", problem: null });
  });

  it.each(["refused", "blocked", "timeout", "malformed", "unavailable", "price"] as DecisionErrorKind[])(
    "an error (%s) shows no problem, is stored as unknown with its kind, and is logged", async (kind) => {
      // Disproved if a failed request is read as a pass ("done") or as a problem, or is not stored.
      const mem = await setup();
      const client = fakeDecisionClient({ answer: () => { throw new DecisionError(kind, "no"); } });
      const lines: string[] = [];
      await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
      const result = await runPhotoCheck(mem.store, ref(), { client, token: TOKEN, log: (l) => lines.push(l) });
      expect(result).toMatchObject({ state: "unknown", error: kind });
      expect(photoCheckView(mem.photos.get(PHOTO)!.check)).toEqual({ state: "unknown" });
      expect(lines).toEqual([expect.stringContaining(`photo check unknown: ${kind}`)]);
    });

  it("a request that does not answer in time stops at the time limit and is stored as unknown (timeout)", async () => {
    const mem = await setup();
    // Answers only when the request's signal stops it, as the live client does.
    const client = fakeDecisionClient({ answer: (r) => new Promise((_, reject) => r.signal.addEventListener("abort", () => reject(new DecisionError("timeout", "time is up")))) });
    await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    const started = Date.now();
    expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN, timeoutMs: 50, log: () => {} })).toMatchObject({ state: "unknown", error: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("an answer that is not a yes/no answer is malformed, never a pass", async () => {
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: { type: "score", score: 0, probabilities: [1], confidence: 1 } }) });
    await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN, log: () => {} })).toMatchObject({ state: "unknown", error: "malformed" });
  });

  it("no straightened page, or a page too small for the model, is unknown and sends nothing", async () => {
    for (const [straight, error] of [[null, "missing"], [await page(400, 200), "image"], [new Uint8Array([1, 2, 3]), "image"]] as const) {
      const mem = await setup({ straight });
      const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
      await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
      expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN, log: () => {} })).toMatchObject({ state: "unknown", error });
      expect(client.requests).toHaveLength(0);
    }
  });

  it("runs only for test families and admins: another family gets no claim, no request and nothing stored", async () => {
    // Disproved if a family outside test_accounts and admins gets a pending value or a request.
    const mem = await setup({ parent: OTHER });
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
    expect(await claimPhotoCheck(mem.store, ref(OTHER), { client, token: TOKEN })).toBe(false);
    expect(mem.photos.get(PHOTO)!.check).toBeNull();
    expect(mem.writes).toEqual([]);
    expect(client.requests).toHaveLength(0);
  });

  // Review of PR #874, finding 1: a parent who is not an admin has a saved, calibrated photo; markedFamily answered true;
  // then an admin removes the family from test_accounts (admin_set_test_account(parent, false)).
  it("a family removed between the eligibility read and the claim gets no claim: the claim checks membership itself", async () => {
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
    // The earlier read said yes; the removal lands before the claim's transaction.
    const stale = { ...mem.store, eligible: async () => { mem.eligible.delete(FAMILY); return true; } };
    expect(await claimPhotoCheck(stale, ref(), { client, token: TOKEN })).toBe(false);
    expect(mem.photos.get(PHOTO)!.check).toBeNull();
    expect(mem.writes).toEqual([]);
    expect(client.requests).toHaveLength(0);
  });

  it("a family removed after the claim and before the deferred request: no request, and the pending claim is removed", async () => {
    // Disproved if the photo is sent to the model or any value stays stored for the removed family.
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
    expect(await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN })).toBe(true);
    mem.eligible.delete(FAMILY);
    expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN, log: () => {} })).toMatchObject({ state: "unknown", error: "ineligible" });
    expect(client.requests).toHaveLength(0);
    expect(mem.photos.get(PHOTO)!.check).toBeNull();
  });

  it("a family removed while the price is read: the last check comes after it, so no request is sent", async () => {
    const mem = await setup();
    const inner = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
    const order: string[] = [];
    const client = { ...inner, decide: inner.decide, ready: async () => { order.push("price"); mem.eligible.delete(FAMILY); } };
    const store = { ...mem.store, eligible: async (p: string) => { order.push("eligible"); return mem.store.eligible(p); } };
    await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    expect(await runPhotoCheck(store, ref(), { client, token: TOKEN, log: () => {} })).toMatchObject({ state: "unknown", error: "ineligible" });
    expect(order).toEqual(["price", "eligible"]);
    expect(inner.requests).toHaveLength(0);
    expect(mem.photos.get(PHOTO)!.check).toBeNull();
  });

  it("a family removed while the request runs: the finish stores no result and removes the pending claim", async () => {
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => { mem.eligible.delete(FAMILY); return { blurry: noul(0.9) }; } });
    await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    await runPhotoCheck(mem.store, ref(), { client, token: TOKEN });
    expect(client.requests).toHaveLength(1);
    expect(mem.photos.get(PHOTO)!.check).toBeNull();
    expect(mem.writes).toEqual([`claim:${PHOTO}`, `release:${PHOTO}`]);
  });

  it("is off with no decision client, or with no question that has a threshold", async () => {
    const mem = await setup();
    expect(await claimPhotoCheck(mem.store, ref(), { client: null, token: TOKEN })).toBe(false);
    const client = fakeDecisionClient({ answer: () => ({}) });
    expect(await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN, thresholds: { blurry: null, glare: null, shadow: null, faint: null } })).toBe(false);
    expect(mem.writes).toEqual([]);
  });

  it("claims a photo once; a sent photo is not claimed; a replaced claim's late finish changes nothing; a late result after send is stored", async () => {
    const mem = await setup();
    const client = fakeDecisionClient({ answer: () => ({ blurry: noul(0.9) }) });
    expect(await claimPhotoCheck(mem.store, ref(), { client, token: TOKEN })).toBe(true);
    expect(await claimPhotoCheck(mem.store, ref(), { client, token: "another" })).toBe(false);
    // The parent sends the photo while the check runs: the result is still stored (and the screen no longer shows it).
    mem.photos.get(PHOTO)!.sent = true;
    expect(await runPhotoCheck(mem.store, ref(), { client, token: TOKEN })).toMatchObject({ state: "done" });
    expect(mem.photos.get(PHOTO)!.check?.state).toBe("done");
    // A finish with a token that is not the pending claim writes nothing.
    const before = mem.photos.get(PHOTO)!.check;
    expect(await mem.store.finish({ ...ref(), token: "stale", result: { state: "unknown", version: 1, model: "m", error: "timeout", ms: 0, at: "x" } })).toBe(false);
    expect(mem.photos.get(PHOTO)!.check).toBe(before);
    const sent = await setup();
    sent.photos.get(PHOTO)!.sent = true;
    expect(await claimPhotoCheck(sent.store, ref(), { client, token: TOKEN })).toBe(false);
  });

  it("the parent's view reads only known states", () => {
    expect(photoCheckView(null)).toBeNull();
    expect(photoCheckView({ state: "other" })).toBeNull();
    expect(photoCheckView({ state: "pending", token: "t", at: "a" })).toEqual({ state: "pending" });
  });

  it("scales a large page to fit 1,568 px and keeps a small one", async () => {
    expect(await sharp(await photoCheckImage(await page(2550, 3300))).metadata()).toMatchObject({ width: 1212, height: 1568 });
    expect(await sharp(await photoCheckImage(await page(800, 1000))).metadata()).toMatchObject({ width: 800, height: 1000 });
    await expect(photoCheckImage(await page(1568, 200))).rejects.toThrow(/too small/);
  });
});

describe("the threshold rule (#855)", () => {
  const rows = (clear: number[], blurry: (number | null)[]) => [
    ...clear.map((yes, n) => ({ photo: `c${n}`, problem: false, yes })),
    ...blurry.map((yes, n) => ({ photo: `b${n}`, problem: true, yes })),
  ];
  it("takes the lowest value from 0.50 that flags no clear photo, and passes at 8 of 10 caught", () => {
    expect(chooseThreshold(rows([0.04, 0.05], [0.86, 0.82, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.3, null]))).toMatchObject({ threshold: 0.5, caught: 8, problems: 10, passes: true, failed: 1 });
    expect(chooseThreshold(rows([0.04, 0.72], [0.86, 0.73, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.3, 0.3]))).toMatchObject({ threshold: 0.73, caught: 8, passes: true });
    expect(chooseThreshold(rows([0.04, 0.88], [0.86, 0.73, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.3, 0.3]))).toMatchObject({ threshold: 0.89, caught: 6, passes: false });
    expect(chooseThreshold(rows([0.995], [1, 1]))).toMatchObject({ threshold: null, passes: false });
  });
});
