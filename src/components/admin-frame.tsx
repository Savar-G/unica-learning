import "server-only";
import { Suspense, type ReactNode } from "react";
import { AdminPage } from "@/components/admin";
import { AdminPending } from "@/components/admin-pending";
import { AdminShell } from "@/components/admin-shell";
import { loadAdminBadges } from "@/lib/admin-badges";
import { TESTS_SHOWING_NOTE } from "@/lib/admin-test-families";
import { showTestFamilies } from "@/lib/admin-test-families-server";

/**
 * The admin frame (D-313, D-315): the sidebar (admin-shell.tsx) and the page. `title`: the page's light h1 inside the
 * standard width, with the folder as a mono eyebrow, `lead` (one line on what the page is for) and `actions` on the right;
 * null when the page lays out its own head (the dashboard, the activity log and the emails, which also set `wide`).
 * `testNote`: the page is a list that shows test families right now (the "Show test families" switch, or ?tests=1); a
 * slim note says so at the top (true for the usual words, or the page's own words). Pass the page's own view.show.
 */
export async function AdminFrame({ email, title, lead, actions, children, wide = false, testNote }: {
  email: string; title: ReactNode; lead?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean; testNote?: boolean | ReactNode;
}) {
  const showTests = await showTestFamilies();
  // Not awaited: the badges stream into the sidebar after the page.
  const badges = loadAdminBadges();
  return (
    <div className={`look-root adm-root${wide ? " is-wide" : ""}`} data-look="warm">
      <AdminShell email={email} showTests={showTests} badges={badges} pending={<Suspense fallback={null}><AdminPending /></Suspense>}>
        <AdminPage title={title} lead={lead} actions={actions} wide={wide} note={testNote ? (testNote === true ? TESTS_SHOWING_NOTE : testNote) : null}>
          {children}
        </AdminPage>
      </AdminShell>
    </div>
  );
}

