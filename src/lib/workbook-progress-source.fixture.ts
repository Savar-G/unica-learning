// Synthetic sources. No family, provider, image, Storage or credential fixture.
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "./database";
import { historyFixture, historyId } from "./workbook-progress-history.fixture";
import { QUESTION_PACKAGE_VERSION } from "./question-package";
import { planWorkbook } from "./workbook-plan";
import type { FrozenSourceBook, FrozenWorkbookSources, WorkbookPreviewRequest } from "./workbook-progress-source";

export const previewActor = historyId(900);
export function previewSourceFixture(total = 123) {
  const h = historyFixture(total);
  const request: WorkbookPreviewRequest = { version: 1, requestId: historyId(901), parentId: h.input.snapshot.parentId, childId: h.input.snapshot.childId,
    workbookId: h.input.books[0].workbookId, printedRevision: h.input.books[0].printedRevision,
    selection: { unit: h.input.snapshot.selection.unit, skill: h.input.snapshot.selection.skill, step: h.input.snapshot.selection.step },
    cutoff: h.input.snapshot.cutoff, scope: "day7" };
  const json = (v: unknown): Json => JSON.parse(JSON.stringify(v));
  const planned = planWorkbook(h.planning);
  if (!planned.ok) throw Error("synthetic-plan-refused");
  const frozen: FrozenWorkbookSources = { version: 1, parentId: request.parentId, childId: request.childId, markingRevision: 50,
    profileReferences: [], assessmentReferences: [], books: h.input.books.map((b, i): FrozenSourceBook => ({
      book: { id: b.workbookId, parent_id: request.parentId, child_id: request.childId, number: 2 - i, status: "shipped", printed_revision: b.printedRevision, print_manifest: structuredClone(b.manifest), profile_build: "child profile revision 17" },
      delivery: { auditId: i + 1, deliveredAt: "2026-01-01T00:00:00.000Z" },
      pages: b.pages.map(p => ({ id: p.pageId, parent_id: request.parentId, workbook_id: b.workbookId, page_number: p.number, day_label: `Day ${p.day}`, page_type: p.type,
        image_width: 800, image_height: 1000, print_contract: { version: 1, workbookId: b.workbookId, page: p.number, label: null, day: p.day, pageOfDay: 1,
          coordinates: { units: "image-px", origin: "top-left", x: "right", y: "down", orientation: "portrait", image: { width: 800, height: 1000 }, cssPage: { width: 800, height: 1000 }, scale: { x: 1, y: 1 } },
          marks: { anchor: "outer-corner", order: ["tl", "tr", "br", "bl"], points: { tl: { x: 20, y: 20 }, tr: { x: 780, y: 20 }, br: { x: 780, y: 980 }, bl: { x: 20, y: 980 } } }, fingerprints: { content: "frozen-content", image: "a".repeat(64) } } })),
      questions: b.pages.flatMap(p => p.questions.map(q => ({ id: historyId(50_000 + p.number), parent_id: request.parentId, workbook_id: b.workbookId, page_id: p.pageId, question_number: q.number,
        schema_version: QUESTION_PACKAGE_VERSION, package: json({ ...q.package, item: { ...q.package!.item, checks: [{ kind: "sequence", terms: [{ type: "number", value: 12 }, { region: "answer" }, { type: "number", value: 14 }], step: { type: "number", value: 1 } }] } }), teaching: structuredClone(q.teaching), regions: [], box_x: 0, box_y: 0, box_width: 10, box_height: 10 }))),
      items: h.marks.filter(m => m.workbook_id === b.workbookId), changes: [], events: h.events.filter(e => e.workbook_id === b.workbookId),
      approvals: [{ id: 10 + i, parent_id: request.parentId, child_id: request.childId, workbook_id: b.workbookId, run_id: historyId(80_000 + i), action: "workbook-approved", at: "2025-12-31T00:00:00.000Z", detail: { revision: 1 } }],
      frames: [{ run_id: historyId(80_000 + i), parent_id: request.parentId, child_id: request.childId, created_at: "2025-12-30T00:00:00.000Z",
        frame: { version: 1, profileRevision: 17, grade: 1, curriculum: "bc", workbooks: [], plan: planned.plan, versions: { curriculum: b.manifest.curriculum.version, outline: "synthetic-outline", model: "synthetic", solveModel: "synthetic", build: null } } }],
    })) };
  return { h, request, frozen };
}
type Row = Record<string, unknown>;
export interface SourceCall { table: string; params: URLSearchParams; method: string; index: number }
export function sourceDbFixture(options: { cap?: number; total?: number; hook?: (call: SourceCall, tables: Record<string, Row[]>) => { missingCount?: boolean; empty?: boolean; count?: number; rows?: Row[] } | void } = {}) {
  const f = previewSourceFixture(options.total), calls: SourceCall[] = [];
  const { frozen, request } = f;
  const tables: Record<string, Row[]> = { parents: [{ id: request.parentId, deletion_requested_at: null }], children: [{ id: request.childId, parent_id: request.parentId }], family_deletions: [], child_deletions: [],
    scan_marking_revisions: [{ parent_id: request.parentId, child_id: request.childId, revision: 50 }], workbooks: frozen.books.map(b => b.book),
    workbook_pages: frozen.books.flatMap(b => b.pages), workbook_questions: frozen.books.flatMap(b => b.questions), scan_marking_items: frozen.books.flatMap(b => b.items), scan_mark_changes: [], learning_events: frozen.books.flatMap(b => b.events),
    workbook_audit: frozen.books.flatMap(b => b.approvals), workbook_run_frames: frozen.books.flatMap(b => b.frames), child_profiles: [], learner_profiles: [], workbook_delivery_corrections: [],
    workbook_delivery_receipts: frozen.books.map(b => ({ workbook_id: b.book.id, parent_id: request.parentId, child_id: request.childId, number: b.book.number, delivered_at: b.delivery.deliveredAt,
      recorded_at: b.delivery.deliveredAt, local_time: "2025-12-31T16:00", time_zone: "America/Vancouver", zone_override: false, actor_id: previewActor, audit_id: b.delivery.auditId })) };
  const db = createClient<Database>("https://preview.example.invalid", "synthetic-no-credentials", { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: async (input, init) => {
    const u = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const call = { table: u.pathname.split("/").at(-1)!, params: u.searchParams, method: init?.method ?? "GET", index: calls.length };
    calls.push(call);
    if (!Object.hasOwn(tables, call.table) || !["GET", "HEAD"].includes(call.method) || !u.pathname.startsWith("/rest/v1/")) throw Error("forbidden-source-boundary");
    const hook = options.hook?.(call, tables);
    let rows: Row[] = tables[call.table].map(r => {
      if (call.table !== "scan_mark_changes") return { ...r };
      const mark = tables.scan_marking_items.find(m => m.id === r.item_id);
      return { ...r, scan_marking_items: mark && { workbook_id: mark.workbook_id, printed_revision: mark.printed_revision } };
    });
    const field = (r: Row, f: string) => f.split(".").reduce<unknown>((v, k) => v && typeof v === "object" ? (v as Row)[k] : undefined, r);
    for (const [f, c] of u.searchParams) {
      if (c.startsWith("eq.")) rows = rows.filter(r => String(field(r, f)) === c.slice(3));
      if (c.startsWith("gt.")) rows = rows.filter(r => typeof field(r, f) === "number" ? Number(field(r, f)) > Number(c.slice(3)) : String(field(r, f)) > c.slice(3));
    }
    const order = u.searchParams.get("order")?.split(".")[0];
    if (order) rows.sort((a, b) => a[order]! < b[order]! ? -1 : a[order]! > b[order]! ? 1 : 0);
    const count = hook?.count ?? rows.length;
    if (u.searchParams.has("limit")) rows = rows.slice(0, Math.min(Number(u.searchParams.get("limit")), options.cap ?? Infinity));
    if (hook?.empty) rows = [];
    if (hook?.rows) rows = hook.rows;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (new Headers(init?.headers).get("prefer")?.includes("count=exact") && !hook?.missingCount) headers["Content-Range"] = `*/${count}`;
    return new Response(call.method === "HEAD" ? null : JSON.stringify(rows), { status: 200, headers });
  } } });
  return { ...f, tables, db, calls };
}
