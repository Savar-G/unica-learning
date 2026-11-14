import { scanJson } from "@/lib/scan-photo-server";

/**
 * A parent changed a finished mark here (S5, #458). Since 2026-11-14 no parent changes a mark: only our team does, through
 * `admin_set_scan_mark` on /admin/scans. The path stays so an old open page gets a plain refusal, and records nothing.
 * Parent changes already made stay in `scan_mark_changes` and still show in the page's mark history.
 */
export async function PATCH() {
  return scanJson({ error: "refused" }, 403);
}
