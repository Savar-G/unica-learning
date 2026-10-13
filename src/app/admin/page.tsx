import { HELP_FAST_RIGHT_MIN, TOO_FAST_MS } from "@/lib/assessment";
import { LIST_MAX, listTests, requireAdmin } from "@/lib/admin-store";
import { ADMIN_PATH, listOffset, parseFilters } from "@/lib/admin-view";
import { pageMetadata } from "@/lib/metadata";
import { AdminFrame, FilterForm, More, TestsTable } from "@/components/admin";
import { PrototypeDashboard, SHOW_PROTOTYPE } from "./_prototype/dashboard";

export const metadata = pageMetadata({ path: ADMIN_PATH, title: "Admin: tests", description: "Admin area.", index: false });

// The admin area's main list (#77): every test, newest first, with the filters of the ticket. Admins only: everyone
// else gets the site's 404 (requireAdmin), and every read runs with the admin's own session.
export default async function AdminTests({ searchParams }: PageProps<"/admin">) {
  const query = await searchParams;
  // PROTOTYPE ONLY: outside production, /admin shows the dashboard variants; ?variant=0 keeps the tests list.
  if (SHOW_PROTOTYPE && query.variant !== "0") return <PrototypeDashboard query={query} />;
  const admin = await requireAdmin();
  const filters = parseFilters(query);
  const offset = listOffset(query, LIST_MAX);
  const { rows, more } = await listTests(admin, filters, offset);
  return (
    <AdminFrame email={admin.email} section="tests" title="Tests">
      <FilterForm action={ADMIN_PATH} filters={filters} fields={["status", "grade", "province", "help", "lowAi"]} />
      <p className="adm-note">
        {rows.length} test{rows.length === 1 ? "" : "s"}. Help likely: the child said someone helped, or {HELP_FAST_RIGHT_MIN} or more right answers
        came in under {TOO_FAST_MS / 1000} seconds, or a long pause came before a run of right answers.
      </p>
      <TestsTable tests={rows} />
      <More more={more} max={LIST_MAX} offset={offset} action={ADMIN_PATH} filters={filters} />
    </AdminFrame>
  );
}
