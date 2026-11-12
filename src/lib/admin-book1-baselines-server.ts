// #870 The page's read of the Book 1 starting records that need the team (src/lib/admin-book1-baselines.ts), through the
// admin's own session and one admin-only database function (admin_book1_baseline_items). The database keeps only a
// revision that is the draft's newest approval and has no baseline, leaves the hidden test families out, and names the
// child and the newest Book 1 run, all before the limit: a stale row (pending and tries rows are immutable, so an old
// revision stays in them) cannot crowd out a real one.
import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import type { TestFamilies } from "@/lib/admin-test-families";
import type { Book1BaselineLoad } from "@/lib/admin-book1-baselines";

export const BOOK1_ITEMS_READ = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loadAdminBook1Baselines(admin: AdminSession, tests: Pick<TestFamilies, "hidden" | "isTest">): Promise<Book1BaselineLoad> {
  const hidden = tests.hidden.filter((id) => UUID.test(id));
  const { data, error } = await admin.db.rpc("admin_book1_baseline_items", { p_limit: BOOK1_ITEMS_READ + 1, p_hide: hidden });
  if (error || !Array.isArray(data)) return { rows: [], unavailable: true, more: false };
  const rows = data.slice(0, BOOK1_ITEMS_READ).map((r) => ({
    draftId: r.draft_id, revision: r.revision, runId: r.run_id ?? null, parentId: r.parent_id, childId: r.child_id, childName: r.child_name ?? null,
    kind: r.kind === "failing" ? "failing" as const : "pending" as const, reason: r.reason ?? null, tries: r.tries ?? null, testFamily: tests.isTest(r.parent_id),
  }));
  return { rows, unavailable: false, more: data.length > BOOK1_ITEMS_READ };
}
