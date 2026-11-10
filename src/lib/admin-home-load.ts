import "server-only";
import { buildBooks, type Book } from "@/lib/admin-production";
import { listProduction, requireAdmin } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import type { WaitingAnswer } from "@/lib/admin-home";
import { readScanTeamQueue } from "@/lib/scan-team-marks";
import { workbookRunner } from "@/lib/workbook-ai";

// What Home (D-315) reads besides the dashboard: Production's books and the marking queue, with the same readers as
// those pages and the same "Show test families" switch. The page starts this beside loadDashboard, so every read runs
// at once. A read that fails leaves its panel saying so; the rest of Home still shows. Nothing here in demo data.

export interface HomeExtras {
  /** Production's books (test families only while the switch is on), or null when the read failed. */
  books: Book[] | null;
  /** The answers waiting for the team, oldest first (the oldest 100), with the full count; null when the read failed. */
  queue: { items: WaitingAnswer[]; total: number } | null;
  /** Whether a parent id is a test or team family. */
  isTest: (parentId: string) => boolean;
  runner: "mac" | "server";
  now: Date;
}

const QUEUE_READ = 100;

export async function loadHomeExtras(query: Record<string, string | string[] | undefined>, demo: boolean): Promise<HomeExtras | null> {
  if (demo) return null;
  const admin = await requireAdmin();
  const view = await loadTestFamilies(admin);
  const now = new Date();
  const [books, queue] = await Promise.all([
    listProduction(admin, view.hidden, now)
      .then((data) => buildBooks({ ...data, tests: { show: view.show, isTest: view.isTest } }, now))
      .catch((e) => (console.error("[admin] home production read failed", e instanceof Error ? e.message : e), null)),
    readScanTeamQueue(admin.db, QUEUE_READ, { withTests: false })
      .then((q) => ({ items: q.items.map((i): WaitingAnswer => ({ parent: i.parent, child: i.child, childName: i.childName, book: i.book, issue: i.issue, since: i.since, testFamily: i.testFamily })), total: q.realTotal }))
      .catch((e) => (console.error("[admin] home marking read failed", e instanceof Error ? e.message : e), null)),
  ]);
  return { books, queue, isTest: (p) => view.isTest(p), runner: workbookRunner(), now };
}
