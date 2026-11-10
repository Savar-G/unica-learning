// The admin area's shared parts: the page head, plain dense tables in the warm look, chips and the filters (a plain GET
// form). Safe in the browser too (the parent app preview renders an admin list); the frame with the sidebar, which reads
// the request, is admin-frame.tsx.
import Link from "next/link";
import type { ReactNode } from "react";
import { AdminEyebrow } from "@/components/admin-shell";
import { gradeLabel, helpLikely } from "@/lib/assessment";
import {
  ADMIN_PATH,
  GRADES,
  PROVINCES,
  STATUSES,
  STATUS_TEXT,
  adminParentPath,
  adminReportPath,
  adminTestPath,
  helpAnswerText,
  filterQuery,
  levelText,
  when,
  type AdminFilters,
} from "@/lib/admin-view";
import type { TestRow } from "@/lib/admin-store";
import { CURRICULA } from "@/lib/signup";
import type { AssessmentStatus } from "@/lib/test-api";
import "./admin.css";

/** The page column's content: the test families note, the page head and the page. AdminFrame puts it beside the sidebar;
 * the parent app preview uses it alone. */
export function AdminPage({ title, lead, actions, wide = false, note, children }: {
  title: ReactNode; lead?: ReactNode; actions?: ReactNode; wide?: boolean; note?: ReactNode; children: ReactNode;
}) {
  const head = title === null ? null : (
    <header className="adm-head">
      <div className="adm-head-text">
        <AdminEyebrow />
        <h1>{title}</h1>
        {lead && <p className="adm-head-lead">{lead}</p>}
      </div>
      {actions && <div className="adm-head-actions">{actions}</div>}
    </header>
  );
  return (
    <main id="main" className={wide ? "adm-main-wide" : "adm-main"}>
      {note && <p className="adm-testbar" role="note"><span className="adm-chip is-test">test</span>{note}</p>}
      {head}
      {children}
    </main>
  );
}

/** The dashed "test" tag beside a test or team family in a list (shown only while the switch is on). */
export const TestTag = ({ test }: { test: boolean | null | undefined }) => (test ? <> <span className="adm-chip is-test" title="A test or team family: left out of every number">test</span></> : null);

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

export const Chip = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`adm-chip is-${tone}`}>{children}</span>;

const STATUS_TONE: Record<AssessmentStatus, Tone> = { in_progress: "info", completed: "ok", expired: "muted" };
export const StatusChip = ({ status }: { status: AssessmentStatus }) => <Chip tone={STATUS_TONE[status]}>{STATUS_TEXT[status]}</Chip>;

/** A table that scrolls sideways on its own when the screen is too narrow. `label` names it for screen readers. */
export function Table({ label, head, children, empty }: { label: string; head: ReactNode[]; children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="adm-empty">{empty}</p>;
  return (
    <div className="adm-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="adm-table">
        <thead><tr>{head.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Says when a list stopped at its limit, so a short list is never read as the whole story. */
export function More({ more, max, offset = 0, action, filters }: { more: boolean; max: number; offset?: number; action?: string; filters?: AdminFilters }) {
  const page = Math.floor(offset / max) + 1;
  const href = (n: number) => {
    const q = new URLSearchParams(filters ? filterQuery(filters) : "");
    q.set("page", String(n));
    return `${action}?${q}`;
  };
  return <nav className="adm-row" aria-label="List pages">
    <span className="adm-note">Page {page}. Up to {max} records per page.</span>
    {action && page > 1 && <Link href={href(page - 1)}>Newer</Link>}
    {action && more && <Link href={href(page + 1)}>Older</Link>}
  </nav>;
}

type Field = "status" | "grade" | "province" | "help" | "lowAi";

/** The filters as a GET form: the choices go into the address, so a filtered list can be bookmarked or shared. */
export function FilterForm({ action, filters, fields }: { action: string; filters: AdminFilters; fields: readonly Field[] }) {
  const has = (f: Field) => fields.includes(f);
  return (
    <form className="adm-filters" action={action} method="get" aria-label="Filters">
      {has("status") && (
        <label>Status
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_TEXT[s]}</option>)}
          </select>
        </label>
      )}
      {has("grade") && (
        <label>Grade
          <select name="grade" defaultValue={filters.grade ?? ""}>
            <option value="">Any</option>
            {GRADES.map((g) => <option key={g} value={g}>{gradeLabel(g)}</option>)}
          </select>
        </label>
      )}
      {has("province") && (
        <label>Curriculum
          <select name="province" defaultValue={filters.province ?? ""}>
            <option value="">Any</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{CURRICULA[p]}</option>)}
          </select>
        </label>
      )}
      {has("help") && <label>Flags<select name="flag" defaultValue={filters.help ? "help" : filters.flagged ? "any" : ""}><option value="">Any test</option><option value="any">Flagged</option><option value="help">Help likely</option></select></label>}
      {has("lowAi") && <label className="adm-check"><input type="checkbox" name="ai" value="low" defaultChecked={filters.lowAi} /> Low AI confidence</label>}
      <button type="submit" className="btn adm-btn">Apply</button>
      <Link href={action} className="adm-clear">Clear</Link>
    </form>
  );
}

/** "Grade 3, BC" for a child or a test. */
export const gradeAndPlace = (grade: number, province: keyof typeof CURRICULA) => `${gradeLabel(grade)}, ${province === "other" ? "other" : province}`;

/** A test's flags, help answer and AI reviews as chips, for the tests tables. */
export function TestFlags({ t }: { t: Pick<TestRow, "flags" | "status" | "help" | "reviews"> }) {
  const likely = t.flags !== null && helpLikely(t.flags);
  const chips = [
    likely ? <Chip key="help" tone="warn">Help likely</Chip> : t.flags && t.flags.length > 0 ? <Chip key="flags" tone="muted">{t.flags.length} flag{t.flags.length === 1 ? "" : "s"}</Chip> : null,
    t.reviews.low > 0 ? <Chip key="ai" tone="bad">{t.reviews.low} low AI of {t.reviews.total}</Chip> : t.reviews.total > 0 ? <Chip key="ai" tone="ok">{t.reviews.total} AI sure</Chip> : null,
  ].filter(Boolean);
  return <>
    {chips.length > 0 ? <span className="adm-row">{chips}</span> : <span className="adm-note">{t.flags === null ? "-" : "None"}</span>}
    {t.status === "completed" && <span className="adm-sub">Did anyone help? {helpAnswerText(t.help)}</span>}
  </>;
}

/**
 * The tests table of the main list and of a family. `family`: leave out the parent column. `isTest`: tag a test family.
 * The result (status, answers, level and route) is one cell; flags, the help answer and AI reviews another.
 */
export function TestsTable({ tests, family = false, isTest }: { tests: TestRow[]; family?: boolean; isTest?: (parentId: string) => boolean }) {
  const head = ["Started (Pacific)", "Child", ...(family ? [] : ["Parent"]), "Result", "Flags and AI", "Report"];
  return (
    <Table label="Tests" head={head} empty="No tests match.">
      {tests.map((t) => (
        <tr key={t.id}>
          <td className="adm-nowrap"><Link href={adminTestPath(t.id)}>{when(t.started_at)}</Link></td>
          <td><Link href={`${ADMIN_PATH}/children/${t.child_id}`}>{t.child?.first_name ?? "Child"}</Link><span className="adm-sub">{gradeAndPlace(t.grade, t.province)}</span></td>
          {!family && <td>{t.parent ? <Link href={adminParentPath(t.parent.id)}>{t.parent.name}</Link> : "?"}<TestTag test={isTest?.(t.parent_id)} /><span className="adm-sub">{t.parent?.email}</span></td>}
          <td className="adm-nowrap">
            <StatusChip status={t.status} />
            <span className="adm-sub">{t.answered} answered</span>
            {t.placement && <span className="adm-sub">Level {levelText(t.placement.workingLevel)} · route {t.placement.route}</span>}
          </td>
          <td><TestFlags t={t} /></td>
          <td>{t.reportId ? <Link href={adminReportPath(t.reportId)}>Report</Link> : "-"}</td>
        </tr>
      ))}
    </Table>
  );
}
