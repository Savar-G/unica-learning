import { isUuid } from "@/lib/workbook-content";
import { addDays, localDateTime, localDay, partsInZone, type FamilyZone } from "@/lib/family-time";
import type { WorkbookScanProgress } from "@/lib/workbook-scan-progress";

export const ACTIVITY_EVENTS = ["page_visit", "scanner_opened", "maya_chat_attempt", "maya_voice_attempt"] as const;
export const CUSTOMER_ACTIVITY_KINDS = [...ACTIVITY_EVENTS, "contact_note", "plan_confirmation"] as const;
export const ACTIVITY_PAGES = ["home", "workbooks", "progress", "billing", "assessment", "report", "scanner", "desk", "feedback", "goals"] as const;
export const ACTIVITY_CONSENT_COOKIE = "unica_activity_consent";
export type ActivityEvent = typeof ACTIVITY_EVENTS[number];
export type ActivityPage = typeof ACTIVITY_PAGES[number];
export interface ActivityInput { event: ActivityEvent; page: ActivityPage; request: string; child: string | null; book: string | null }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function activityInput(value: unknown): ActivityInput | null {
  if (!object(value) || Object.keys(value).some(k => !["event", "page", "request", "child", "book"].includes(k))) return null;
  const event = ACTIVITY_EVENTS.find(e => e === value.event), page = ACTIVITY_PAGES.find(p => p === value.page);
  if (!event || !page || !isUuid(value.request) || (value.child !== null && !isUuid(value.child)) || (value.book !== null && !isUuid(value.book))) return null;
  if (value.book && !value.child) return null;
  if (event === "scanner_opened" && (page !== "scanner" || !value.child)) return null;
  if ((event === "maya_chat_attempt" || event === "maya_voice_attempt") && (page !== "desk" || !value.book)) return null;
  return { event, page, request: value.request, child: value.child, book: value.book };
}
export function contactInput(value: unknown) {
  if (!object(value) || Object.keys(value).some(k => !["parent", "child", "note", "request"].includes(k))
    || !isUuid(value.parent) || !isUuid(value.request) || (value.child !== null && !isUuid(value.child))
    || typeof value.note !== "string" || !value.note.trim() || value.note.length > 2000) return null;
  return { parent: value.parent, child: value.child, note: value.note.trim(), request: value.request };
}
export function telemetryRequestAllowed(request: Request, consent: string | undefined) {
  return consent === "granted" && request.headers.get("origin") === new URL(request.url).origin
    && request.headers.get("sec-fetch-site") !== "cross-site";
}
export function activityPage(path: string): ActivityPage | null {
  if (path === "/account" || /^\/account\/start(?:\/|$)/.test(path)) return "home";
  if (/^\/account\/scan(?:\/|$)/.test(path)) return "scanner";
  if (path.startsWith("/account/workbooks")) return "workbooks";
  if (path.startsWith("/account/progress")) return "progress";
  if (path === "/account/plan" || path.startsWith("/account/billing")) return "billing";
  if (/^\/account\/test(?:\/|$)/.test(path)) return "assessment";
  if (/^\/account\/report(?:\/|$)/.test(path)) return "report";
  if (path === "/account/feedback") return "feedback";
  if (path === "/account/goals") return "goals";
  return null;
}
export function activityCursor(value: string | undefined): { at: string; key: string } | null {
  if (!value) return null;
  const split = value.indexOf("|");
  const at = value.slice(0, split), key = value.slice(split + 1);
  if (split < 0 || !/^\d{4}-\d\d-\d\dT/.test(at) || !Number.isFinite(Date.parse(at)) || !/^[a-z_]+:[a-zA-Z0-9-]{1,80}$/.test(key)) throw new Error("Invalid history position. Reset the filters.");
  return { at, key };
}
export interface ActivityRow { key: string; at: string; parent: string; child: string | null; book: string | null; type: string; actor: string; actorName: string | null; label: string; href: string; note: string | null; familyName: string; childName: string | null; test: boolean }
export function progressSummary(progress: Extract<WorkbookScanProgress, { status: "available" }>) {
  const days = progress.days.map(day => {
    const pages = day.requiredPages.map(id => progress.pages.find(p => p.pageId === id));
    const known = pages.every(p => p?.markingStatus !== null && p?.markingStatus !== undefined);
    const marked = known ? pages.filter(p => p?.reviewReady === true).length : null;
    return { day: day.day, required: pages.length, scanned: day.acceptedPages.length, marked,
      team: known ? pages.filter(p => p?.markingStatus === "review").length : null,
      failed: known ? pages.filter(p => p?.markingStatus === "failed").length : null,
      state: !day.acceptedPages.length ? "No accepted scan" : day.gaps.length ? "Partial scans" : "All scans accepted" };
  });
  return { days, scannedDays: days.filter(d => d.scanned === d.required).length,
    markedDays: days.some(d => d.marked === null) ? null : days.filter(d => d.marked === d.required).length,
    scannedPages: days.reduce((n, d) => n + d.scanned, 0),
    markedPages: days.some(d => d.marked === null) ? null : days.reduce((n, d) => n + (d.marked ?? 0), 0),
    requiredPages: days.reduce((n, d) => n + d.required, 0) };
}
/** Qualifying product work only. Visits, notes, retries and emails are not inputs. */
export function inactivity(delivered: string | null, work: string | null, zone: FamilyZone, now: number, finished = false) {
  if (!delivered || !Number.isFinite(Date.parse(delivered)) || Date.parse(delivered) > now) return { state: "unknown" as const, due: null };
  if (finished) return { state: "finished" as const, due: null };
  const anchor = Math.max(Date.parse(delivered), work && Number.isFinite(Date.parse(work)) ? Date.parse(work) : -Infinity);
  if (anchor > now) return { state: "unknown" as const, due: null };
  const p = partsInZone(anchor, zone, { hour: "numeric", minute: "numeric", second: "numeric", hourCycle: "h23" });
  const due = localDateTime(addDays(localDay(anchor, zone), 4), zone, +p.hour, +p.minute, +p.second) + anchor % 1000;
  return { state: now >= due ? "due" as const : "recent" as const, due: new Date(due).toISOString() };
}
