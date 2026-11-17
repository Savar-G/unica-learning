import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { activityCursor, inactivity, type ActivityRow } from "@/lib/customer-activity";
import { isUuid } from "@/lib/workbook-content";
import { familyZone } from "@/lib/family-time";
import { adminClient } from "@/lib/supabase-auth";
import { workbookScanProgressStore } from "@/lib/workbook-scan-progress-store";
import { readWorkbookScanProgress } from "@/lib/workbook-scan-progress-reader";
import { historyPage, type HistoryPage } from "@/lib/scan-history";
import { scanHistoryStore } from "@/lib/scan-history-reader";

const obj = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("Activity read unavailable"); return v as Record<string, unknown>; };
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error("Activity read unavailable"); return v; };
const str = (v: unknown): string => { if (typeof v !== "string") throw new Error("Activity read unavailable"); return v; };
const nullable = (v: unknown) => v === null ? null : str(v);
const num = (v: unknown): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("Activity read unavailable"); return v; };
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw new Error("Activity read unavailable"); return v; };
export function customerFilters(q: Record<string, string | string[] | undefined>, now: number) {
  const one = (k: string) => typeof q[k] === "string" ? q[k] : undefined;
  const id = (k: string) => { const v = one(k)?.trim() || null; if (v && !isUuid(v)) throw new Error("Invalid family, child or book filter."); return v; };
  const date = (k: string, fallback: string) => { const v = one(k) || fallback; if (!/^\d{4}-\d\d-\d\d$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error("Use a valid date."); return v; };
  const from = date("from", new Date(now - 30 * 86400000).toISOString().slice(0, 10));
  const to = date("to", new Date(now + 86400000).toISOString().slice(0, 10));
  if (Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > 366 * 86400000) throw new Error("Select a period from 1 to 366 days.");
  const type = one("type") || null, actor = one("actor") || null;
  if (type && !["account", "note", "visit", "attempt", "assessment", "scan", "mark", "maya", "feedback", "delivery", "workbook", "plan", "email"].includes(type)) throw new Error("Invalid activity type.");
  if (actor && !["team", "parent", "child", "system", "unknown"].includes(actor)) throw new Error("Invalid actor.");
  const search = one("search")?.trim() || null;
  if (search && search.length > 80) throw new Error("Search must have at most 80 characters.");
  const attention = one("attention") || null;
  if (attention && !["team", "assessment", "inactive"].includes(attention)) throw new Error("Invalid attention filter.");
  const booksBefore = one("booksBefore") || null;
  if (booksBefore && (!/^[1-9]\d{0,5}$/.test(booksBefore))) throw new Error("Invalid book position.");
  return { attention, search, parent: id("family"), child: id("child"), book: id("book"), childrenAfter: id("childrenAfter"), booksBefore: booksBefore ? Number(booksBefore) : null, from, to, type, actor, cursor: activityCursor(one("after")) };
}
export type CustomerFilters = ReturnType<typeof customerFilters>;
export function parseCustomerHistory(raw: unknown): ActivityRow[] {
  return list(raw).map(v => { const r = obj(v); return { key: str(r.key), at: str(r.at), parent: str(r.parent_id), child: nullable(r.child_id),
    book: nullable(r.workbook_id), type: str(r.type), actor: str(r.actor), actorName: nullable(r.actor_name), label: str(r.label).replaceAll("_", " "),
    href: str(r.href), note: nullable(r.note), familyName: str(r.family_name), childName: nullable(r.child_name), test: bool(r.test) }; });
}
export function parseCustomerChildren(raw: unknown) {
  return list(raw).map(v => { const r = obj(v), a = r.assessment === null ? null : obj(r.assessment), m = obj(r.maya);
    const identity = r.inactivity === null ? null : obj(r.inactivity);
    return { id: str(r.id), parent: str(r.parent_id), name: str(r.first_name), family: str(r.family_name), test: bool(r.test),
      zone: familyZone({ timeZone: nullable(r.time_zone), postal: nullable(r.postal), province: nullable(r.province) }),
      lastWork: nullable(r.last_work), lastVisit: nullable(r.last_visit), plan: nullable(r.plan),
      inactivity: identity && { book: str(identity.workbook_id), deliveredAt: str(identity.delivered_at), anchorAt: str(identity.anchor_at) },
      assessment: a && { id: str(a.id), status: str(a.status), at: nullable(a.at), resumeUntil: str(a.resumeUntil) },
      maya: { sessions: num(m.sessions), seconds: m.seconds === null ? null : num(m.seconds), unknownDuration: num(m.unknownDuration), ended: num(m.ended), withWork: num(m.withWork), solved: num(m.solved), technical: num(m.technical), noOutcome: num(m.noOutcome) },
      books: list(r.books).map(v => { const b = obj(v); return { id: str(b.id), number: num(b.number), status: str(b.status),
        delivered: nullable(b.delivered), firstScan: nullable(b.first_scan), receipts: num(b.receipts), scannedPages: num(b.scanned_pages), repeatPhotos: num(b.repeat_photos), contractAvailable: bool(b.contract_available) }; }) };
  });
}
export function childInactivity(child: ReturnType<typeof parseCustomerChildren>[number], now: number) {
  const identity = child.inactivity;
  const work = [child.lastWork, identity?.anchorAt].filter((at): at is string => !!at).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return inactivity(identity?.deliveredAt ?? null, work, child.zone, now);
}
export function parseCustomerMetrics(raw: unknown) {
  const r = obj(raw);
  return { families: num(r.families), activeFamilies: num(r.activeFamilies), mayaFamilies: num(r.mayaFamilies),
    deliveredBooks: num(r.deliveredBooks), deliveryWithScan: num(r.deliveryWithScan), deliveryMissingScan: num(r.deliveryMissingScan), deliveryMissingContract: num(r.deliveryMissingContract),
    deliveryEarlierScan: num(r.deliveryEarlierScan), deliveryAfterPeriod: num(r.deliveryAfterPeriod), medianFirstScanHours: r.medianFirstScanHours === null ? null : num(r.medianFirstScanHours),
    telemetryStart: nullable(r.telemetryStart), awaitingTeamFamilies: num(r.awaitingTeamFamilies) };
}
async function read<T>(call: PromiseLike<{ data: unknown; error: unknown }>, parse: (v: unknown) => T) {
  try { const result = await call; if (result.error) throw new Error("unavailable"); return { data: parse(result.data), error: false as const }; }
  catch { return { data: null, error: true as const }; }
}
export async function loadCustomerActivity(admin: AdminSession, filters: CustomerFilters, tests: boolean, now = Date.now()) {
  // Three bounded calls, independent partial states. No polling or whole-database transfer.
  const signal = AbortSignal.timeout(10000);
  const loadChildren = async () => {
    const picked: ReturnType<typeof parseCustomerChildren> = [];
    let after = filters.childrenAfter;
    for (let batch = 0; batch < 1000; batch++) {
      signal.throwIfAborted();
      const { data, error } = await admin.db.rpc("admin_customer_children", { p_parent: filters.parent, p_child: filters.child, p_after: after,
        p_tests: tests, p_from: filters.from, p_to: filters.to, p_book: filters.book, p_books_before: filters.booksBefore,
        ...(filters.attention ? { p_attention: filters.attention } : {}), ...(filters.search ? { p_search: filters.search } : {}) }).abortSignal(signal);
      if (error) throw new Error("Child summaries unavailable");
      const rows = parseCustomerChildren(data);
      for (const row of rows) {
        if (after && row.id <= after) throw new Error("Invalid child position");
        after = row.id;
        if (filters.attention !== "inactive" || childInactivity(row, now).state === "due") picked.push(row);
        if (picked.length === 26) return { data: picked, error: null };
      }
      if (filters.attention !== "inactive" || rows.length < 26) return { data: picked, error: null };
    }
    throw new Error("Inactivity selection exceeded its read bound");
  };
  const [history, children, metrics] = await Promise.all([
    read(admin.db.rpc("admin_customer_history", { p_parent: filters.parent, p_child: filters.child, p_book: filters.book,
      p_from: filters.from, p_to: filters.to, p_type: filters.type, p_actor: filters.actor,
      p_after_at: filters.cursor?.at ?? null, p_after_key: filters.cursor?.key ?? null, p_tests: tests, ...(filters.search ? { p_search: filters.search } : {}) }).abortSignal(signal), parseCustomerHistory),
    loadChildren().then(result => ({ data: result.data, error: false as const })).catch(() => ({ data: null, error: true as const })),
    read(admin.db.rpc("admin_customer_metrics", { p_from: filters.from, p_to: filters.to }).abortSignal(signal), parseCustomerMetrics),
  ]);
  return { history, children, metrics };
}
/** Book identity does not depend on a truncated child or book list. The admin RPC checks visibility. */
export async function loadSelectedCustomerBook(admin: AdminSession, filters: CustomerFilters, tests: boolean) {
  if (!filters.book) return null;
  try {
    const { data, error } = await admin.db.rpc("admin_customer_book", { p_book: filters.book, p_parent: filters.parent, p_child: filters.child, p_tests: tests })
      .abortSignal(AbortSignal.timeout(5000));
    if (error || !data) return null;
    const row = obj(data), parent = str(row.parent), child = str(row.child), id = str(row.id);
    if (id !== filters.book || (filters.parent && parent !== filters.parent) || (filters.child && child !== filters.child)) return null;
    return { id, parent, child, number: num(row.number), name: str(row.childName), family: str(row.familyName),
      progress: await loadCustomerBook(admin, parent, child, id) };
  } catch { return null; }
}
/** Read exactly one selected book. The existing canonical reader rechecks ownership and effective delivery. */
export async function loadCustomerBook(admin: AdminSession, parentId: string, childId: string, workbookId: string) {
  const db = adminClient(AbortSignal.timeout(10000), { retry: false });
  if (!db) return null;
  try {
    const scope = { parentId, childId, workbookId }, now = Date.now();
    const history = scanHistoryStore(db, { admin: admin.userId });
    const pages: HistoryPage[] = [];
    let completeHistory = true;
    const result = await readWorkbookScanProgress(workbookScanProgressStore(db), scope, now, async (s, after) => {
      const batch = await history.read({ child: s.childId, workbook: s.workbookId, status: "all", after });
      if (!batch) { completeHistory = false; return null; }
      const canonical = batch.pages.map(p => historyPage(p, now, "admin"));
      pages.push(...canonical);
      return { parentId: s.parentId, pages: canonical, after: batch.pages.at(-1)?.id ?? null };
    });
    return result.status === "available" ? { ...result, canonicalPages: completeHistory ? pages : null } : null;
  } catch { return null; }
}
