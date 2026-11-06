/** Parent-only feedback. No workbook, assessment, child stage or release flag is an admission condition. */
export const FEEDBACK_PATH = "/account/feedback";
export const FEEDBACK_SIGN_IN = `/sign-in?next=${encodeURIComponent(FEEDBACK_PATH)}`;
export const FEEDBACK_MAX = 5000;
export const FEEDBACK_PER_HOUR = 5;
export const FEEDBACK_PRODUCTS = [
  { value: "workbook", label: "Workbook" },
  { value: "parent_dashboard", label: "Parent dashboard" },
  { value: "marking", label: "Marking" },
  { value: "maya", label: "Maya (AI Teaching Assistant)" },
  { value: "other", label: "Something else" },
] as const;
export type FeedbackProduct = typeof FEEDBACK_PRODUCTS[number]["value"];
export function feedbackProduct(value: unknown): FeedbackProduct | null {
  return FEEDBACK_PRODUCTS.find(p => p.value === value)?.value ?? null;
}
/** Only section names survive. Never retain query tokens, child/report IDs, fragments or external URLs. */
export function feedbackSource(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/account") || value.startsWith("//")) return FEEDBACK_PATH;
  const path = value.split(/[?#]/)[0];
  const section = path.split("/")[2];
  return ["feedback", "settings", "workbooks", "scan", "progress", "notes", "report", "plan", "pin", "password", "learning", "start", "finish", "maya-notice"].includes(section)
    ? `/account/${section}` : path === "/account" ? path : FEEDBACK_PATH;
}
/** A parent link passes only its known section, never the full current URL. */
export const feedbackLink = (path: string) => `${FEEDBACK_PATH}?${new URLSearchParams({ from: feedbackSource(path) })}`;
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export interface FeedbackInput { requestId: string; childId: string | null; product: FeedbackProduct; text: string; source: string }
export type FeedbackError = "empty" | "too_long" | "no_product" | "invalid" | "conflict" | "rate_limited" | "family_unavailable" | "child_unavailable" | "unavailable" | "signed_out" | "desk_open";
export type FeedbackResult = { ok: true } | { ok: false; error: FeedbackError };
export type FeedbackAdmission = "saved" | "duplicate" | "conflict" | "rate_limited" | "family_unavailable" | "child_unavailable";
export interface FeedbackStore { submit(parent: string, input: FeedbackInput): Promise<FeedbackAdmission> }
export function feedbackInput(body: unknown): FeedbackInput | FeedbackResult {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid" };
  const b = body as Record<string, unknown>;
  if (typeof b.text !== "string") return { ok: false, error: "invalid" };
  if (!b.text.trim()) return { ok: false, error: "empty" };
  if ([...b.text].length > FEEDBACK_MAX) return { ok: false, error: "too_long" };
  const product = feedbackProduct(b.product);
  if (b.product === "" || b.product == null) return { ok: false, error: "no_product" };
  if (!product || !uuid(b.requestId) || (b.childId != null && !uuid(b.childId)) || b.text.includes("\0")) return { ok: false, error: "invalid" };
  return { requestId: b.requestId.toLowerCase(), childId: typeof b.childId === "string" ? b.childId.toLowerCase() : null, product, text: b.text.trim(), source: feedbackSource(b.source) };
}
export function feedbackAdmission(data: unknown): FeedbackAdmission {
  if (["saved", "duplicate", "conflict", "rate_limited", "family_unavailable", "child_unavailable"].includes(data as string)) return data as FeedbackAdmission;
  throw new Error("Feedback: invalid store result");
}
export async function sendFeedback(store: FeedbackStore, parent: string, body: unknown): Promise<FeedbackResult> {
  const input = feedbackInput(body);
  if ("ok" in input) return input;
  try {
    const result = feedbackAdmission(await store.submit(parent, input));
    return result === "saved" || result === "duplicate" ? { ok: true } : { ok: false, error: result };
  } catch { return { ok: false, error: "unavailable" }; }
}
export const FEEDBACK_MESSAGES: Record<FeedbackError, string> = {
  no_product: "Choose a product before you send your feedback.",
  empty: "Write your feedback before you send it.", too_long: "Use 5,000 characters or fewer. Your text is still here.",
  invalid: "Check your feedback and try again.", conflict: "This request was already used for different feedback. Send again to save this message.",
  rate_limited: "You have sent five messages in the past hour. Please try again later.",
  family_unavailable: "Feedback cannot be sent while your account is being deleted.", child_unavailable: "Feedback cannot be sent for this child. Return to your account and try again.",
  unavailable: "We could not confirm that your feedback was saved. Your text is still here. Please try again.",
  signed_out: "Sign in again to send your feedback. Your text is still here.", desk_open: "Leave the child's desk with your PIN before you send feedback.",
};
export interface FeedbackRow { id: string; parent_id: string; child_id: string | null; product: string; text: string; source: string; created_at: string; status: string }
