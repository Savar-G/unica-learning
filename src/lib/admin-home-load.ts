import "server-only";
import { buildBooks, type Book } from "@/lib/admin-production";
import { listProduction, requireAdmin, type AdminSession } from "@/lib/admin-store";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import type { TestFamilies } from "@/lib/admin-test-families";
import { neverStartedChildren, planCandidates, type PlanEvidence, type WaitingAnswer } from "@/lib/admin-home";
import { readScanTeamQueue } from "@/lib/scan-team-marks";
import { workbookRunner } from "@/lib/workbook-ai";

// What Home (D-315) reads besides the dashboard: Production's books and the marking queue, with the same readers as
// those pages and the same "Show test families" switch, and the plan records of the children whose Book 1 is
// delivered. The page starts this beside loadDashboard, so every read runs at once. A read that fails leaves its panel
// saying so; the rest of Home still shows. Nothing here in demo data.
//
// Requests: Production's reader (a constant number, whatever the number of runs; admin-store.ts), then, only when a
// child's Book 1 is delivered with no current plan, 4 plan record reads for each 100 such children. No per-run reads.

export interface HomeExtras {
  /** Production's books (test families only while the switch is on), or null when the read failed. */
  books: Book[] | null;
  /** Production's read stopped before every child: Home says so, as Production does, and offers no Prepare from it. */
  incomplete: boolean;
  /** The children whose plan never started, by Plans and delivery's rule; null when that read failed (no plan link then). */
  neverStarted: ReadonlySet<string> | null;
  /** The real answers waiting for the team, oldest first (the oldest 100), with the real total; null when the read failed. */
  queue: { items: WaitingAnswer[]; total: number } | null;
  /** Whether a parent id is a test or team family. */
  isTest: (parentId: string) => boolean;
  runner: "mac" | "server";
  now: Date;
}

const QUEUE_READ = 100;
/** Children per plan record read, so a request URL stays short. */
const PLAN_CHUNK = 100;
/** Rows one plan record read may hold; a read that reaches it fails closed (no plan link). */
const PLAN_ROWS = 1000;

export async function loadHomeExtras(query: Record<string, string | string[] | undefined>, demo: boolean): Promise<HomeExtras | null> {
  if (demo) return null;
  const admin = await requireAdmin();
  const view = await loadTestFamilies(admin);
  return readHomeExtras(admin, view, new Date());
}

/** Home's extra reads for an admin and the switch's view. */
export async function readHomeExtras(admin: AdminSession, view: Pick<TestFamilies, "ids" | "show" | "isTest">, now: Date): Promise<HomeExtras> {
  const [production, queue] = await Promise.all([
    readHomeProduction(admin, view, now)
      .catch((e) => (console.error("[admin] home production read failed", e instanceof Error ? e.message : e), null)),
    readScanTeamQueue(admin.db, QUEUE_READ, { withTests: false })
      .then((q) => ({ items: q.items.map((i): WaitingAnswer => ({ parent: i.parent, child: i.child, childName: i.childName, book: i.book, issue: i.issue, since: i.since, testFamily: i.testFamily })), total: q.realTotal }))
      .catch((e) => (console.error("[admin] home marking read failed", e instanceof Error ? e.message : e), null)),
  ]);
  return {
    books: production?.books ?? null, incomplete: production?.incomplete ?? false, neverStarted: production?.neverStarted ?? null,
    queue, isTest: (p) => view.isTest(p), runner: workbookRunner(), now,
  };
}

async function readHomeProduction(admin: AdminSession, view: Pick<TestFamilies, "ids" | "show" | "isTest">, now: Date) {
  const data = await listProduction(admin, { ids: view.ids, show: view.show }, now);
  const books = buildBooks({ ...data, tests: { show: view.show, isTest: view.isTest } }, now);
  const candidates = planCandidates(books);
  const neverStarted = await readNeverStarted(admin, candidates)
    .catch((e) => (console.error("[admin] home plan records read failed", e instanceof Error ? e.message : e), null));
  return { books, incomplete: data.incomplete, neverStarted };
}

/** The candidates' plan records (card setups, plan starts, old confirmations, stored plans), PLAN_CHUNK children at a time. */
async function readNeverStarted(admin: AdminSession, candidates: { childId: string; parentId: string }[]): Promise<Set<string>> {
  if (!candidates.length) return new Set();
  const ev: PlanEvidence = { cards: [], starts: [], sentEmails: [], states: [] };
  const rows = <T>(r: { data: T[] | null; error: { message: string } | null }, what: string): T[] => {
    if (r.error || !r.data) throw new Error(`${what}: ${r.error?.message ?? "no rows"}`);
    if (r.data.length >= PLAN_ROWS) throw new Error(`${what}: too many rows`);
    return r.data;
  };
  for (let i = 0; i < candidates.length; i += PLAN_CHUNK) {
    const part = candidates.slice(i, i + PLAN_CHUNK);
    const children = [...new Set(part.map((c) => c.childId))];
    const parents = [...new Set(part.map((c) => c.parentId))];
    const [cards, starts, emails, states] = await Promise.all([
      admin.db.rpc("admin_card_setups").select("id, child_id, parent_id").in("child_id", children).limit(PLAN_ROWS),
      admin.db.from("plan_starts").select("card_setup_id, state").in("parent_id", parents).limit(PLAN_ROWS),
      admin.db.from("workbook_emails").select("child_id").in("child_id", children).eq("kind", "plan_start").eq("status", "sent").limit(PLAN_ROWS),
      admin.db.from("child_plan_states").select("child_id, parent_id, kind").in("child_id", children).limit(PLAN_ROWS),
    ]);
    ev.cards.push(...rows(cards, "card setups").map((c) => ({ id: c.id, childId: c.child_id, parentId: c.parent_id })));
    ev.starts.push(...rows(starts, "plan starts").map((s) => ({ cardSetupId: s.card_setup_id, state: s.state })));
    ev.sentEmails.push(...rows(emails, "plan start emails").map((e) => e.child_id));
    ev.states.push(...rows(states, "plan states").map((s) => ({ childId: s.child_id, parentId: s.parent_id, kind: s.kind })));
  }
  return neverStartedChildren(candidates, ev);
}
