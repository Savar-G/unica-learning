import { isUuid } from "@/lib/workbook-content";
import { scanSession, scanJson } from "@/lib/scan-photo-server";
import { HOLD_SECONDS, MAX_HOLD_SECONDS } from "@/lib/scan-send";

/**
 * The Undo's hold, kept on the server (scan edge sweep #3, docs/scan-pages.md "Sending after Undo"). The phone holds a
 * page that passed for the Undo's wait: `{ ids }` writes when it comes due (`seconds`, HOLD_SECONDS by default; up to
 * MAX_HOLD_SECONDS while the capture screen is open). `{ ids, undo: true }` is Undo: the pages are let go and never sent
 * on their own, and a hold that arrives after it changes nothing, so the two may arrive in any order and be sent again.
 * `released` lists the unsent pages Undo covers; a page missing from it was already sent. `{ ids, release: true }` lets
 * go of a hold with no Undo mark (the phone dropped the page, or swapped its photo), so it may be held again. A page whose hold passes is sent by the server if the phone did not send it: on the family's next load
 * of Scan pages and from the recovery run. Only this family's unsent saved photos are held; Send's own rule still
 * decides at the send.
 */
export async function POST(request: Request) {
  const session = await scanSession();
  if (request.headers.get("origin") !== new URL(request.url).origin) return scanJson({ error: "refused" }, 403);
  let body: { ids?: unknown; undo?: unknown; release?: unknown; seconds?: unknown };
  try { body = await request.json(); } catch { return scanJson({ error: "refused" }, 400); }
  const { ids, undo, release, seconds = HOLD_SECONDS } = body ?? {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !ids.every(isUuid)) return scanJson({ error: "refused" }, 400);
  if (!Number.isSafeInteger(seconds) || (seconds as number) < 1 || (seconds as number) > MAX_HOLD_SECONDS) return scanJson({ error: "refused" }, 400);
  const unique = [...new Set(ids as string[])];
  const { data, error } = undo === true
    ? await session.admin.rpc("unhold_scan_photos", { p_parent: session.parent, p_ids: unique })
    : release === true ? await session.admin.rpc("release_scan_holds", { p_parent: session.parent, p_ids: unique })
      : await session.admin.rpc("hold_scan_photos", { p_parent: session.parent, p_ids: unique, p_seconds: seconds as number });
  if (error) return scanJson({ error: "unavailable" }, 503);
  return scanJson(undo === true || release === true ? { released: data ?? [] } : { held: data ?? [] });
}
