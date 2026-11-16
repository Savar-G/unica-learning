import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { monitorProduct, productAfter, productEvent, setProductObserver, type ProductCode } from "./product-monitoring";

beforeEach(() => { vi.clearAllMocks(); setProductObserver(null); });
afterEach(() => { setProductObserver(null); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("drops child content, URLs, arbitrary strings, nested data, and invalid numeric attributes before observation", () => {
  const observer = vi.fn(); setProductObserver(observer);
  monitorProduct("maya.ended", { callId: "11111111-1111-4111-8111-111111111111", photoId: "Bearer secret", count: 3,
    total: Infinity, pending: -1, scored: 1.2, kind: "chat", mode: "voice", step: "Alice", flag: "safety_concern",
    name: "Alice", text: "My answer is 12", email: "parent@example.test", url: "https://private.test/token", error: Error("private"), extra: { prompt: "secret" } });
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "maya.ended", attributes: {
    callId: "11111111-1111-4111-8111-111111111111", count: 3, kind: "chat", mode: "voice", flag: "safety_concern",
  } });
  expect(productEvent("Alice" as ProductCode, { count: 1 })).toBeNull();
  expect(productEvent("toString" as ProductCode)).toBeNull();
});

it("contains synchronous and asynchronous observer failures", async () => {
  setProductObserver(() => { throw Error("private"); });
  expect(() => monitorProduct("scan.send_accepted")).not.toThrow();
  setProductObserver(async () => { throw Error("private"); });
  monitorProduct("scan.send_accepted");
  await Promise.resolve();
});

it("keeps tasks alive through the scheduler and reports both registration and later task failure", async () => {
  const observer = vi.fn(), work = vi.fn().mockRejectedValue(Error("private")); setProductObserver(observer);
  const tasks: (() => Promise<void>)[] = [];
  expect(productAfter((task) => { tasks.push(task); }, work, "scan.check_failed")).toBe(true);
  expect(work).not.toHaveBeenCalled();
  await expect(tasks[0]()).resolves.toBeUndefined();
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.check_failed", attributes: {} });
  observer.mockClear();
  expect(productAfter(() => { throw Error("registration"); }, work, "scan.check_failed")).toBe(false);
  expect(observer).toHaveBeenCalledExactlyOnceWith({ code: "scan.check_failed", attributes: { step: "schedule" } });
});
