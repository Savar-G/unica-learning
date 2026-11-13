import type { HealthRow } from "@/lib/admin-health";

// Made-up counts for ?demo=1 in local development, so the page can be seen with every tone (D-099: no sign-in, no family data).
export function demoHealthRows(now: Date): HealthRow[] {
  const ago = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
  return [
    { key: "runs_failed", n7: 3, d7: 5, n30: 4, d30: 12, at: ago(30) },
    { key: "fit_failed", n7: 12, d7: 600, n30: 40, d30: 2400, at: ago(70) },
    { key: "gate_flags", n7: 9, d7: 40, n30: 15, d30: 160, at: ago(26) },
    { key: "marking_waiting", n7: 4, d7: 120, n30: 4, d30: 400, at: ago(55) },
    { key: "photo_refused", n7: 6, d7: 30, n30: 10, d30: 80, at: ago(5) },
    { key: "photo_unknown", n7: 0, d7: 30, n30: 1, d30: 80, at: ago(300) },
    { key: "maya_technical", n7: 1, d7: 40, n30: 3, d30: 150, at: ago(48) },
    { key: "maya_flagged", n7: 1, d7: 40, n30: 1, d30: 150, at: ago(48) },
    { key: "email_failed", n7: 2, d7: 90, n30: 5, d30: 400, at: ago(20) },
    { key: "report_missing", n7: 0, d7: 6, n30: 0, d30: 20, at: null },
    { key: "feedback_new", n7: 2, d7: 3, n30: 2, d30: 5, at: ago(30) },
  ];
}
