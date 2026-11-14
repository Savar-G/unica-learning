import { describe, expect, it } from "vitest";
import { busyWait, nextUploads, roomWait, UPLOAD_SLOTS, waitsForRoom } from "@/lib/scan-upload-queue";

describe("busyWait", () => {
  it("asks again quickly at first, without showing the photo as waiting", () => {
    expect(busyWait(0)).toEqual({ delayMs: 1500, held: false });
    expect(busyWait(19)).toEqual({ delayMs: 1500, held: false });
  });

  it("then shows the photo as waiting for room and asks less often, with no last try", () => {
    expect(busyWait(20)).toEqual({ delayMs: 5000, held: true });
    expect(busyWait(21)).toEqual({ delayMs: 10000, held: true });
    expect(busyWait(22)).toEqual({ delayMs: 15000, held: true });
    expect(busyWait(10_000)).toEqual({ delayMs: 15000, held: true });
  });

  it("shows waiting after about 30 seconds of busy answers", () => {
    let waited = 0, tries = 0;
    while (!busyWait(tries).held) waited += busyWait(tries++).delayMs;
    expect(waited).toBe(30_000);
  });
});

describe("nextUploads", () => {
  const u = (key: string, status: "waiting" | "uploading" | "refused") => ({ key, status });

  it("starts up to two waiting photos in the order they were chosen", () => {
    expect(UPLOAD_SLOTS).toBe(2);
    expect(nextUploads([u("a", "waiting"), u("b", "waiting"), u("c", "waiting")], new Set())).toEqual(["a", "b"]);
  });

  it("fills only the free slot, and skips refused and running photos", () => {
    const list = [u("a", "uploading"), u("x", "refused"), u("b", "waiting"), u("c", "waiting")];
    expect(nextUploads(list, new Set(["a"]))).toEqual(["b"]);
    expect(nextUploads(list, new Set(["a", "b"]))).toEqual([]);
  });

  it("does not let a removed photo that is still finishing hold a slot", () => {
    expect(nextUploads([u("b", "waiting"), u("c", "waiting")], new Set(["gone"]))).toEqual(["b", "c"]);
  });
});

describe("roomWait (scan edge sweep, 2026-11-14)", () => {
  it("keeps a photo over the 10-minute limit in its place, shown as waiting, and asks again every 30 s with no last try", () => {
    expect(waitsForRoom("frequency")).toBe(true);
    expect(roomWait("frequency", 0)).toEqual({ delayMs: 30_000, held: true });
    expect(roomWait("frequency", 10_000)).toEqual({ delayMs: 30_000, held: true });
  });

  it("waits for room on busy exactly as before", () => {
    expect(waitsForRoom("busy")).toBe(true);
    for (const tries of [0, 19, 20, 22, 500]) expect(roomWait("busy", tries)).toEqual(busyWait(tries));
  });

  it("does not wait on the day's limit or any other refusal", () => {
    for (const code of ["daily", "quota", "size", "duplicate", "unavailable"]) expect(waitsForRoom(code)).toBe(false);
  });
});
