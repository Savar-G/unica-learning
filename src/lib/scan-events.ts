/** Fixed scan event vocabulary. No data from a page, error, URL or account enters a status. */
export const SCAN_EVENTS = {
  scan_entry: ["opened"], scan_upload_outcome: ["saved", "refused", "failed"],
  scan_retake_reason: ["cut_off", "dark", "blurred", "wrong_page", "unreadable_code", "other"],
  scan_review_complete: ["completed"], scan_post_scan_choice: ["fix_with_maya", "results_only"],
} as const;
export type ScanEvent = keyof typeof SCAN_EVENTS;
export function isScanEvent(event: string): event is ScanEvent { return Object.hasOwn(SCAN_EVENTS, event); }
export function scanStatus(event: string, value: unknown): string | null {
  return isScanEvent(event) && typeof value === "string" && (SCAN_EVENTS[event] as readonly string[]).includes(value) ? value : null;
}
