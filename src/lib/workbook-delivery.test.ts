import { describe, expect, it, vi } from "vitest";
import { confirmDelivery, deliveryDeadlines, deliveryInstant, firstDelivery, type DeliveryReceipt, type DeliveryStore } from "@/lib/workbook-delivery";

const receipt: DeliveryReceipt = {
  workbookId: "00000000-0000-4000-8000-000000000001", parentId: "00000000-0000-4000-8000-000000000002",
  childId: "00000000-0000-4000-8000-000000000003", number: 1, deliveredAt: "2026-10-30T13:37:00.000Z",
  localTime: "2026-10-30T09:37", timeZone: "America/Toronto", recordedAt: "2026-11-02T20:00:00.000Z", actorId: "admin", auditId: 1,
};
const input = { workbookId: receipt.workbookId, childId: receipt.childId, number: 1, localTime: receipt.localTime, timeZone: receipt.timeZone };
const now = Date.parse(receipt.recordedAt);

describe("delivery time and billing prerequisites through public interfaces", () => {
  it("preserves the clock minute across a seasonal change and gives book 2 its own anchors", () => {
    expect(deliveryDeadlines(receipt)).toEqual({ reminderAt: "2026-11-03T14:37:00.000Z", backstopAt: "2026-11-20T14:37:00.000Z" });
    const second = { ...receipt, workbookId: "second", number: 2, deliveredAt: "2026-11-30T14:37:00.000Z" };
    expect(deliveryDeadlines(second)).toEqual({ reminderAt: "2026-12-04T14:37:00.000Z", backstopAt: "2026-12-21T14:37:00.000Z" });
    expect(receipt.deliveredAt).toBe("2026-10-30T13:37:00.000Z");
  });
  it("uses the family-time override, earlier repeated hour, and first valid deadline in a gap", () => {
    expect(deliveryInstant("2026-11-02T09:37", "America/Vancouver")).toBe(Date.parse("2026-11-02T16:37Z"));
    expect(deliveryInstant("2026-11-01T01:37", "America/Toronto")).toBe(Date.parse("2026-11-01T05:37Z"));
    expect(deliveryInstant("2026-03-08T02:37", "America/Toronto")).toBeNull();
    expect(deliveryDeadlines({ ...receipt, deliveredAt: "2026-03-04T07:37Z" }).reminderAt).toBe("2026-03-08T07:00:00.000Z");
    expect(deliveryInstant("2026-11-02T09:37", { zone: "America/Chicago", override: false })).toBe(Date.parse("2026-11-02T15:37Z"));
  });
  it("refuses malformed dates, future delivery, bad zones and identities before a write", async () => {
    const confirm = vi.fn();
    const store: DeliveryStore = { confirm, receipt: vi.fn() };
    for (const localTime of ["2026-02-30T10:00", "2026-11-02T24:00", "2026-11-02T10:60", "2026-11-03T09:00", "bad"]) {
      expect(await confirmDelivery(store, { ...input, localTime }, now)).toMatchObject({ status: "refused" });
    }
    expect(await confirmDelivery(store, { ...input, timeZone: "wrong" }, now)).toMatchObject({ status: "refused" });
    expect(await confirmDelivery(store, { ...input, number: 0 }, now)).toMatchObject({ status: "refused" });
    expect(confirm).not.toHaveBeenCalled();
  });
  it("passes only the validated actual time to the atomic store", async () => {
    const confirm = vi.fn().mockResolvedValue({ status: "confirmed", receipt });
    expect(await confirmDelivery({ confirm, receipt: vi.fn() }, input, now)).toEqual({ status: "confirmed", receipt });
    expect(confirm).toHaveBeenCalledWith({ ...input, deliveredAt: receipt.deliveredAt });
  });
  it("requires the exact shipped first book receipt for separate billing", async () => {
    const store: DeliveryStore = { confirm: vi.fn(), receipt: vi.fn().mockResolvedValue(receipt) };
    const book = { id: receipt.workbookId, parentId: receipt.parentId, childId: receipt.childId, number: 1, status: "shipped" };
    expect(await firstDelivery(store, [book], receipt.parentId, receipt.childId)).toEqual(receipt);
    for (const change of [{ number: 2 }, { status: "printed" }, { parentId: "other" }, { childId: "other" }]) {
      expect(await firstDelivery(store, [{ ...book, ...change }], receipt.parentId, receipt.childId)).toBeNull();
    }
    store.receipt = vi.fn().mockResolvedValue({ ...receipt, number: 2 });
    expect(await firstDelivery(store, [book], receipt.parentId, receipt.childId)).toBeNull();
    store.receipt = vi.fn().mockResolvedValue(null);
    expect(await firstDelivery(store, [book], receipt.parentId, receipt.childId)).toBeNull();
  });
});
