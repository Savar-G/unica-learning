import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database";
import type { ScanRefusal } from "@/lib/scan-crops";
import { dayPages, type DayPage, type StackPhoto } from "@/lib/scan-stack";

// The Scan pages stack's read (round r565): one child's active photos with their check, and the printed pages of the days
// they belong to, in five reads whatever the number of photos. Server only, on the secret key: every read names the family.
// The check comes from the stored calibration (S2b) and only for families that have checks (`checks`, D-252).

const REFUSALS: readonly ScanRefusal[] = ["marks-missing", "marks-inconsistent", "page-mismatch", "orientation-unclear", "ambiguous-page", "qr-mismatch", "printed-page-changed", "failed"];
const refusal = (r: unknown): ScanRefusal => (REFUSALS as readonly unknown[]).includes(r) ? r as ScanRefusal : "failed";

/** The same rule as the photo view: a saved photo until it expires, a pending one for a day. */
const active = (p: { state: string; created_at: string; expires_at: string }, now: number) =>
  Date.parse(p.expires_at) > now && (p.state === "saved" || Date.parse(p.created_at) > now - 86_400_000);

export interface StackRead { photos: StackPhoto[]; pages: DayPage[] }

export async function readScanStack(db: SupabaseClient<Database>, parent: string, child: string, checks: boolean, now = Date.now()): Promise<StackRead> {
  const rows = await db.from("scan_photos").select("id,page_id,workbook_id,state,created_at,expires_at,printed_revision,sent_at")
    .eq("parent_id", parent).eq("child_id", child).in("state", ["pending", "saved"]).order("created_at", { ascending: false }).limit(100);
  if (rows.error) throw new Error("scan_stack_read");
  const live = rows.data.filter((p) => p.page_id && p.workbook_id && active(p, now));
  if (!live.length) return { photos: [], pages: [] };
  const books = [...new Set(live.map((p) => p.workbook_id!))];
  const [workbooks, printed, calibrations] = await Promise.all([
    db.from("workbooks").select("id,number").eq("parent_id", parent).in("id", books),
    db.from("workbook_pages").select("id,workbook_id,page_number,day_label").eq("parent_id", parent).in("workbook_id", books),
    checks
      ? db.from("scan_calibrations").select("photo_id,state,printed_revision,reason:result->>reason").eq("parent_id", parent).in("photo_id", live.map((p) => p.id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (workbooks.error || printed.error || calibrations.error) throw new Error("scan_stack_read");
  const number = new Map(workbooks.data.map((w) => [w.id, w.number]));
  const pageNumber = new Map(printed.data.map((p) => [p.id, p.page_number]));
  const calibration = new Map((calibrations.data ?? []).map((c) => [c.photo_id, c]));
  const photos: StackPhoto[] = live.map((p) => {
    const c = calibration.get(p.id);
    const check: StackPhoto["check"] = !checks ? "none"
      : !c || c.state === "running" ? "checking"
      // A calibration of another printing does not count for this photo (S2b).
      : c.printed_revision !== p.printed_revision ? "unavailable"
      : c.state === "ready" ? "ready" : "refused";
    return {
      id: p.id, pageId: p.page_id!, workbookId: p.workbook_id!, book: number.get(p.workbook_id!) ?? 1, pageNumber: pageNumber.get(p.page_id!) ?? 0,
      state: p.state as StackPhoto["state"], check, reason: check === "refused" ? refusal(c?.reason) : null, sentAt: p.sent_at, createdAt: p.created_at,
    };
  });
  const pages = dayPages(printed.data.map((p) => ({ id: p.id, workbookId: p.workbook_id, book: number.get(p.workbook_id) ?? 1, pageNumber: p.page_number, day: p.day_label })));
  return { photos, pages };
}
