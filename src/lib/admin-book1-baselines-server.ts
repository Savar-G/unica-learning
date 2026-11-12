// #870 The page's read of the Book 1 starting records that need the team (src/lib/admin-book1-baselines.ts), through the
// admin's own session (RLS: admins read the pending, tries, baselines and runs). It reads the newest READ of each list,
// drops every revision a baseline now binds (a local recovery saved it), and names the run and the child. The
// "Show test families" view hides its hidden families in the database, before the limit.
import "server-only";
import type { AdminSession } from "@/lib/admin-store";
import { notIn, type TestFamilies } from "@/lib/admin-test-families";
import { FAILING_TRIES, type Book1BaselineItem, type Book1BaselineLoad } from "@/lib/admin-book1-baselines";

export const BOOK1_ITEMS_READ = 50;

export async function loadAdminBook1Baselines(admin: AdminSession, tests: Pick<TestFamilies, "hidden" | "isTest">): Promise<Book1BaselineLoad> {
  const fail: Book1BaselineLoad = { rows: [], unavailable: true, more: false };
  const hidden = notIn(tests.hidden);
  let pending = admin.db.from("workbook_book1_baseline_pending").select("draft_id,revision,parent_id,child_id,run_id,reason");
  let tried = admin.db.from("workbook_book1_baseline_tries").select("draft_id,revision,parent_id,child_id,tries").gte("tries", FAILING_TRIES);
  if (hidden) { pending = pending.not("parent_id", "in", hidden); tried = tried.not("parent_id", "in", hidden); }
  const [p, t] = await Promise.all([
    pending.order("created_at", { ascending: false }).limit(BOOK1_ITEMS_READ + 1),
    tried.order("last_tried_at", { ascending: false }).limit(BOOK1_ITEMS_READ + 1),
  ]);
  if (p.error || t.error || !p.data || !t.data) return fail;
  const more = p.data.length > BOOK1_ITEMS_READ || t.data.length > BOOK1_ITEMS_READ;
  const key = (d: string, r: number) => `${d}:${r}`;
  const found = new Map<string, Book1BaselineItem>();
  for (const r of p.data.slice(0, BOOK1_ITEMS_READ)) {
    found.set(key(r.draft_id, r.revision), { draftId: r.draft_id, revision: r.revision, runId: r.run_id, parentId: r.parent_id, childId: r.child_id,
      childName: null, kind: "pending", reason: r.reason, tries: null, testFamily: tests.isTest(r.parent_id) });
  }
  for (const r of t.data.slice(0, BOOK1_ITEMS_READ)) {
    if (found.has(key(r.draft_id, r.revision))) continue;
    found.set(key(r.draft_id, r.revision), { draftId: r.draft_id, revision: r.revision, runId: null, parentId: r.parent_id, childId: r.child_id,
      childName: null, kind: "failing", reason: null, tries: r.tries, testFamily: tests.isTest(r.parent_id) });
  }
  if (!found.size) return { rows: [], unavailable: false, more };
  const drafts = [...new Set([...found.values()].map(i => i.draftId))];
  const children = [...new Set([...found.values()].map(i => i.childId))];
  const [baselines, runs, names] = await Promise.all([
    admin.db.from("workbook_book1_baselines").select("draft_id,draft_revision").in("draft_id", drafts),
    admin.db.from("workbook_runs").select("id,draft_id").in("draft_id", drafts).eq("number", 1),
    admin.db.from("children").select("id,first_name").in("id", children),
  ]);
  if (baselines.error || runs.error || names.error || !baselines.data || !runs.data || !names.data) return fail;
  const bound = new Set(baselines.data.map(b => key(b.draft_id, b.draft_revision)));
  const runOf = new Map(runs.data.filter(r => r.draft_id).map(r => [r.draft_id as string, r.id]));
  const nameOf = new Map(names.data.map(c => [c.id, c.first_name]));
  const rows = [...found.entries()].filter(([k]) => !bound.has(k)).map(([, i]) => ({ ...i, runId: i.runId ?? runOf.get(i.draftId) ?? null, childName: nameOf.get(i.childId) ?? null }));
  return { rows, unavailable: false, more };
}
