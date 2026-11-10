import "server-only";
import type { AdminBadges } from "@/lib/admin-nav";
import { buildBooks, needsYouCount } from "@/lib/admin-production";
import { readProductionBase, renderAdmin } from "@/lib/admin-store";
import { notIn } from "@/lib/admin-test-families";
import { testIdsFor } from "@/lib/admin-test-families-server";
import { readScanTeamQueue } from "@/lib/scan-team-marks";

// The sidebar's counts (D-315): a badge shows only when something waits. They stream in after the page (the frame
// passes this promise to the sidebar inside a Suspense boundary), so they never hold the page back. The test family ids
// (shared with the page), then two cheap reads at once; a failed read shows no badge, and test families never count:
// both reads leave them out in the database, before any limit.
//
// Families: families whose card was saved in the last 7 days (the site's own record of the save). Marking: answers
// waiting for the team to mark. Production: the books that need the team (no workbook yet, or a draft ready to
// review), by the Production page's own stage rules (admin-production.ts) on the same light reads the page starts
// from, with test families left out. Plans and delivery has no badge yet: no existing reader defines "plan start
// waiting" cheaply.

const DAY_MS = 86_400_000;
const NEW_DAYS = 7;

export async function loadAdminBadges(now = Date.now()): Promise<AdminBadges> {
  try {
    const admin = await renderAdmin();
    if (!admin) return {};
    const since = new Date(now - NEW_DAYS * DAY_MS).toISOString();
    // Without the test family ids no count can leave them out, so no badge shows (the catch below).
    const testIds = await testIdsFor(admin);
    const test = new Set(testIds);
    const hidden = notIn(testIds);
    let cardRead = admin.db.rpc("admin_card_setups").select("parent_id").gte("card_saved_at", since);
    if (hidden) cardRead = cardRead.not("parent_id", "in", hidden);
    const [cards, queue, production] = await Promise.allSettled([
      cardRead.limit(1000),
      // The switch off: the database leaves test and team families out before its limit, and counts the rest.
      readScanTeamQueue(admin.db, 1, { withTests: false }),
      readProductionBase(admin, testIds),
    ]);
    const out: AdminBadges = {};
    if (cards.status === "fulfilled" && !cards.value.error) {
      const fresh = new Set((cards.value.data ?? []).map((c) => c.parent_id)).size;
      if (fresh > 0) out.families = { text: `${fresh} new`, label: `${fresh} new ${fresh === 1 ? "family" : "families"} saved a card this week`, hot: true };
    }
    if (queue.status === "fulfilled") {
      const real = queue.value.realTotal;
      if (real > 0) out.marking = { text: `${real}`, label: `${real} ${real === 1 ? "answer waits" : "answers wait"} for the team`, hot: true };
    }
    if (production.status === "fulfilled") {
      const base = production.value;
      const waiting = needsYouCount(buildBooks({ ...base, runs: base.runs.map((run) => ({ run })), deliveries: [], tests: { show: false, isTest: (p) => test.has(p) } }, new Date(now)));
      if (waiting > 0) out.production = { text: `${waiting} to do`, label: `${waiting} ${waiting === 1 ? "workbook needs" : "workbooks need"} the team`, hot: true };
    }
    return out;
  } catch (e) {
    console.error("[admin] sidebar badges failed", e instanceof Error ? e.message : e);
    return {};
  }
}
