import { HELP_FAST_RIGHT_MIN, TOO_FAST_MS } from "@/lib/assessment";
import { LIST_MAX, listTests, requireAdmin } from "@/lib/admin-store";
import { testsSummary } from "@/lib/admin-tests";
import { ADMIN_TESTS_PATH, listOffset, parseFilters } from "@/lib/admin-view";
import { loadTestFamilies } from "@/lib/admin-test-families-server";
import { pageMetadata } from "@/lib/metadata";
import { FilterForm, More, TestsTable } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { TestsSummaryTiles } from "@/components/admin-tests";

export const metadata = pageMetadata({ path: ADMIN_TESTS_PATH, title: "Admin: tests", description: "Admin area.", index: false });

// The tests list (#77; it was /admin until the dashboard took that address, D-099): every test, newest first, with
// the filters of the ticket. Admins only: everyone else gets the site's 404 (requireAdmin), and every read runs with
// the admin's own session. Test families follow the "Show test families" switch (D-313). D-315: the summary tiles count
// the real families' tests the page lists (no extra read), then the filters as a toolbar, then the table.
export default async function AdminTests({ searchParams }: PageProps<"/admin/tests">) {
  const admin = await requireAdmin();
  const query = await searchParams;
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const view = await loadTestFamilies(admin);
  const { rows, more } = await listTests(admin, filters, offset, view.hidden);
  // The counts: the real families' tests on this page only (test families are listed while the switch is on, never counted).
  const summary = testsSummary(rows, view.isTest);
  const scope = <>
    {more || offset > 0 ? `Counts the ${summary.started} tests on this page, not older pages.` : "Counts every test that matches the filters."}
    {view.show ? " Test families are not counted." : ""} Help likely: the child said someone helped, or {HELP_FAST_RIGHT_MIN} or more right answers
    came in under {TOO_FAST_MS / 1000} seconds, or a long pause came before a run of right answers.
  </>;
  return (
    <AdminFrame email={admin.email} title="Tests" lead="Every assessment, newest first, with its result and flags." testNote={view.show}>
      <TestsSummaryTiles summary={summary} filters={filters} action={ADMIN_TESTS_PATH} scope={scope} />
      <div className="tst-tools"><FilterForm action={ADMIN_TESTS_PATH} filters={filters} fields={["status", "grade", "province", "help", "lowAi"]} /></div>
      <TestsTable tests={rows} isTest={view.show ? view.isTest : undefined} />
      <More more={more} max={LIST_MAX} offset={offset} action={ADMIN_TESTS_PATH} filters={filters} />
    </AdminFrame>
  );
}
