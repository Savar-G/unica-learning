export const RECEIPT_KEY = "pw-booking-result";
export type BookingReceipt = "reserved" | "waitlist";
const MAX_AGE = 5 * 60 * 1000;

export function keepReceipt(status: BookingReceipt) {
  try { sessionStorage.setItem(RECEIPT_KEY, JSON.stringify({ status, at: Date.now() })); } catch {}
}

export function readReceipt(): BookingReceipt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(RECEIPT_KEY) ?? "null");
    if (!value || typeof value.at !== "number" || value.at > Date.now() || Date.now() - value.at > MAX_AGE) return null;
    return value.status === "reserved" || value.status === "waitlist" ? value.status : null;
  } catch { return null; }
}
