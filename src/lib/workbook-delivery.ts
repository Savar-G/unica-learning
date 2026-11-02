import { addDays, localDateTime, localDay, normalizeTimeZone, partsInZone, type FamilyZone } from "@/lib/family-time";
import { isUuid } from "@/lib/workbook-content";

/** One immutable receipt. Audit time and actor come from the authenticated database action. */
export interface DeliveryReceipt {
  workbookId: string; parentId: string; childId: string; number: number;
  deliveredAt: string; localTime: string; timeZone: FamilyZone;
  recordedAt: string; actorId: string; auditId: number;
}
export interface DeliveryInput {
  workbookId: string; childId: string; number: number; localTime: string; timeZone: FamilyZone;
}
export type DeliveryResult = { status: "confirmed"; receipt: DeliveryReceipt } | { status: "refused"; reason: string };
export interface DeliveryStore {
  receipt(workbookId: string): Promise<DeliveryReceipt | null>;
  /** Atomic admin authorization, identity/status/freeze checks, insert-or-return, and audit. */
  confirm(input: DeliveryInput & { deliveredAt: string }): Promise<DeliveryResult>;
}

export function deliveryLocalTime(at: string | number, zone: FamilyZone): string {
  const p = partsInZone(at, zone, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Reject calendar overflow and missing clock readings; repeated clock readings choose the earlier instant. */
export function deliveryInstant(local: string, zone: FamilyZone): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const [day, clock] = local.split("T");
  const [hour, minute] = clock.split(":").map(Number);
  const calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day || hour > 23 || minute > 59) return null;
  const at = localDateTime(day, zone, hour, minute);
  return deliveryLocalTime(at, zone) === local ? at : null;
}

/** No billing or AI dependency. A retry keeps the original receipt, actor, and server time. */
export async function confirmDelivery(store: DeliveryStore, input: DeliveryInput, now: number): Promise<DeliveryResult> {
  if (!isUuid(input.workbookId) || !isUuid(input.childId) || !Number.isInteger(input.number) || input.number < 1 || input.number > 1000) return { status: "refused", reason: "identity_mismatch" };
  const supplied = typeof input.timeZone === "string" ? input.timeZone : input.timeZone?.zone;
  const zone = normalizeTimeZone(supplied);
  if (!zone || (typeof input.timeZone !== "string" && input.timeZone.override !== false)) return { status: "refused", reason: "invalid_time" };
  const timeZone: FamilyZone = typeof input.timeZone === "string" ? zone : { zone, override: false };
  const at = deliveryInstant(input.localTime, timeZone);
  if (at === null || !Number.isFinite(now) || at > now) return { status: "refused", reason: "invalid_delivery_time" };
  return store.confirm({ ...input, timeZone, deliveredAt: new Date(at).toISOString() });
}

/** Initial anchors only. S11b owns scan activity, eligibility, re-evaluation, and send-once claims. */
export function deliveryDeadlines(receipt: DeliveryReceipt): { reminderAt: string; backstopAt: string } {
  const zone = receipt.timeZone;
  const p = partsInZone(receipt.deliveredAt, zone, { hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const day = localDay(receipt.deliveredAt, zone);
  const after = (days: number) => new Date(localDateTime(addDays(day, days), zone, +p.hour, +p.minute)).toISOString();
  return { reminderAt: after(4), backstopAt: after(21) };
}

/** The separate billing action must find workbook 1's own receipt. No guessed historical delivery. */
export async function firstDelivery(store: DeliveryStore, books: readonly { id: string; parentId: string; childId: string; number: number; status: string }[], parentId: string, childId: string): Promise<DeliveryReceipt | null> {
  const first = books.find((b) => b.number === 1 && b.parentId === parentId && b.childId === childId && b.status === "shipped");
  if (!first) return null;
  const receipt = await store.receipt(first.id);
  return receipt?.parentId === parentId && receipt.childId === childId && receipt.number === 1 && receipt.workbookId === first.id ? receipt : null;
}
