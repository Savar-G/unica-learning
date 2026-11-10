import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toJson, type Database } from "@/lib/database";
import { mark, markingCommand } from "@/lib/scan-marking-reader";
import type { HistoryBudget, HistoryJob, HistoryPhoto, HistoryRecord, HistorySpend, HistoryStore } from "@/lib/scan-history";
import { readScanHistory, type HistoryFilter } from "@/lib/scan-history";
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("history_shape"); return v as Record<string, unknown>; };
const list = (v: unknown): unknown[] => { if (!Array.isArray(v)) throw new Error("history_shape"); return v; };
const str = (v: unknown): string => { if (typeof v !== "string") throw new Error("history_shape"); return v; };
const num = (v: unknown): number => { if (typeof v !== "number" || !Number.isFinite(v)) throw new Error("history_shape"); return v; };
const nullable = (v: unknown) => v === null ? null : str(v);
export type HistoryScope = { parent: string } | { admin: string };
/** The live server reader owns the clock. Pure projections receive a fixed time. */
export function readScanHistoryNow(db: SupabaseClient<Database>, scope: HistoryScope, filter: HistoryFilter, skipChildren?: ReadonlySet<string>, uncounted?: ReadonlySet<string>) {
  return readScanHistory(scanHistoryStore(db, scope), filter, Date.now(), 25, skipChildren, uncounted);
}
/** Same authorized RPC and persisted-mark validation as the lean S4 reader. No image/model imports. */
export function scanHistoryStore(db: SupabaseClient<Database>, scope: HistoryScope): HistoryStore {
  const command = markingCommand(db);
  return { async read(filter) {
    const raw = await command("admin" in scope ? "monitor" : "history", "parent" in scope ? scope.parent : null, null, null,
      toJson({ ...filter, ...("admin" in scope ? { admin: scope.admin } : {}) }));
    if (raw === null) return null;
    const result = object(raw);
    const pages: HistoryRecord[] = list(result.pages).map((v) => {
      const r = object(v);
      const photos: HistoryPhoto[] = list(r.photos).map((p) => { const x = object(p); return { id: str(x.id), state: str(x.state), at: str(x.at), expiresAt: str(x.expiresAt), sentAt: nullable(x.sentAt) }; });
      const jobs: HistoryJob[] = list(r.jobs).map((j) => { const x = object(j); return { photo: str(x.photo), state: str(x.state), blocked: nullable(x.blocked), dispatches: num(x.dispatches) }; });
      const spend: HistorySpend[] = list(r.spend).map((s) => { const x = object(s); return { id: str(x.id), model: str(x.model), at: str(x.at), reserved: num(x.reserved), charged: x.charged === null ? null : num(x.charged), outcome: str(x.outcome) }; });
      return { id: str(r.id), childId: str(r.childId), childName: str(r.childName), workbookId: str(r.workbookId), book: num(r.book), revision: str(r.revision), day: str(r.day), pageNumber: num(r.pageNumber), marks: list(r.marks).map(mark), photos, jobs, spend };
    });
    const b = result.budget === null ? null : object(result.budget);
    const budget: HistoryBudget | null = b && { period: str(b.period), cap: num(b.cap), reported: num(b.reported), held: num(b.held), unknown: num(b.unknown), reserved: num(b.reserved) };
    return { pages, budget };
  } };
}
