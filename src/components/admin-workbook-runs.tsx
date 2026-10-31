// The admin Workbooks area (#312): the list of workbooks by child and status with their check results, and one run's
// page: its progress or its error, then its draft for review, page by page, the page image beside each question's
// data. Failed questions, pages that failed the fit check, pages that did not render and questions code could not
// check are marked on the page and listed at the top. Server components; the refresh while a run works and the
// "Prepare next workbook" button are the only client parts.
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditEntry, ChildRow, DraftCounts, RunDetail, RunListRow } from "@/lib/admin-store";
import { ADMIN_WORKBOOKS_PATH, adminWorkbookPath, adminWorkbookRunPath, when } from "@/lib/admin-view";
import type { WorkbookStatus, WorkbookSummary } from "@/lib/workbook-content";
import type { GeneratedPage, GeneratedQuestion } from "@/lib/workbook-generator";
import { runState, type DraftRendering, type RunState, type RunStep, type WorkbookRun } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";
import { AdminFrame, Chip, Table, type Tone } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";
import { PackageCells, WorkbookStatusChip } from "@/components/admin-workbook";
import { RunRefresh } from "@/components/admin-run-refresh";
import "./admin-workbook.css";

const STATE: Record<RunState, [string, Tone]> = {
  waiting: ["Waiting to start", "info"], preparing: ["Preparing", "info"], stopped: ["Stopped", "warn"], failed: ["Failed", "bad"], done: ["Draft ready", "ok"],
};

const STEP: Record<RunStep, string> = {
  plan: "Planning the two weeks", write: "Writing and checking pages", render: "Making the page images", save: "Saving the draft",
};

export const RunStateChip = ({ state }: { state: RunState }) => <Chip tone={STATE[state][1]}>{STATE[state][0]}</Chip>;

const levelsText = (levels: number[]) => levels.map((l) => `U${l}`).join(", ");

/** "12 of 80 day pages" with a bar, while a run writes. */
export function RunProgress({ run }: { run: WorkbookRun }) {
  const done = run.donePages ?? 0;
  const total = run.totalPages ?? 0;
  return <span className="adm-wb-progress">
    <span className="adm-sub">{run.step ? STEP[run.step] : "Starting"}{total > 0 && ` · ${done} of ${total} day pages`}{run.attempts > 1 && ` · attempt ${run.attempts} of ${run.maxAttempts}`}</span>
    {total > 0 && <progress max={total} value={done} aria-label={`${done} of ${total} day pages written`} />}
  </span>;
}

/** The check results of a draft: what code checked, what it could not, and what failed. */
export function ChecksCell({ counts, notRendered }: { counts: DraftCounts | null; notRendered: number | null }): ReactNode {
  if (!counts) return <span className="adm-sub">No draft yet</span>;
  const checked = counts.questions - counts.failed - counts.notChecked;
  return <span className="adm-wb-checks">
    {counts.failed > 0 ? <Chip tone="bad">{counts.failed} failed</Chip> : <Chip tone="ok">No failed questions</Chip>}
    {counts.failedPages > 0 && <Chip tone="bad">{counts.failedPages} {counts.failedPages === 1 ? "page does" : "pages do"} not fit</Chip>}
    {counts.notChecked > 0 && <Chip tone="warn">{counts.notChecked} not checked by code</Chip>}
    {notRendered ? <Chip tone="warn">{notRendered} {notRendered === 1 ? "page" : "pages"} not rendered</Chip> : null}
    <span className="adm-sub">{checked} of {counts.questions} questions checked by code</span>
  </span>;
}

const childName = (children: Map<string, ChildRow>, id: string) => children.get(id)?.first_name ?? "Unknown child";

/** The run's state cell: the chip, and the progress or the error. */
function StateCell({ run, now }: { run: WorkbookRun; now: Date }) {
  const state = runState(run, now);
  return <>
    <RunStateChip state={state} />
    {(state === "preparing" || state === "waiting") && <RunProgress run={run} />}
    {(state === "failed" || state === "stopped") && <span className="adm-sub">{run.error ?? "It stopped without finishing: no progress for 6 minutes."}</span>}
  </>;
}

export const LIST_FILTERS = ["all", "preparing", "attention", "ready", "failed", "approved", "printed", "shipped"] as const;
export type ListFilter = (typeof LIST_FILTERS)[number];
const FILTER_TEXT: Record<ListFilter, string> = {
  all: "All", preparing: "Preparing", attention: "Draft needs attention", ready: "Draft with no failures", failed: "Failed or stopped",
  approved: "Approved", printed: "Printed", shipped: "Shipped",
};

type Row =
  | { kind: "run"; childId: string; at: string; row: RunListRow; state: RunState }
  | { kind: "workbook"; childId: string; at: string; workbook: WorkbookSummary };

const needsAttention = (r: RunListRow) => !!r.counts && (r.counts.failed > 0 || r.counts.failedPages > 0 || r.counts.notChecked > 0 || (r.notRendered ?? 0) > 0);

function keep(row: Row, filter: ListFilter): boolean {
  if (filter === "all") return true;
  if (row.kind === "workbook") return row.workbook.status === filter;
  if (filter === "preparing") return row.state === "preparing" || row.state === "waiting";
  if (filter === "failed") return row.state === "failed" || row.state === "stopped";
  if (filter === "attention") return row.state === "done" && needsAttention(row.row);
  if (filter === "ready") return row.state === "done" && !needsAttention(row.row);
  return false;
}

/** The Workbooks list: every run's draft and every stored workbook, by child, newest first in each child. */
export function AdminWorkbookList({ email, runs, more, workbooks, childNames: children, filter, now }: {
  email: string; runs: RunListRow[]; more: boolean; workbooks: WorkbookSummary[]; childNames: Map<string, ChildRow>; filter: ListFilter; now: Date;
}) {
  const rows: Row[] = [
    ...runs.map((row): Row => ({ kind: "run", childId: row.run.childId, at: row.run.createdAt, row, state: runState(row.run, now) })),
    ...workbooks.map((workbook): Row => ({ kind: "workbook", childId: workbook.childId, at: workbook.createdAt, workbook })),
  ].filter((r) => keep(r, filter));
  rows.sort((a, b) => childName(children, a.childId).localeCompare(childName(children, b.childId)) || a.childId.localeCompare(b.childId) || b.at.localeCompare(a.at));
  const preparing = runs.some((r) => ["preparing", "waiting"].includes(runState(r.run, now)));
  return (
    <AdminFrame email={email} section="workbooks" title="Workbooks">
      <p className="adm-lead">Drafts made with &ldquo;Prepare next workbook&rdquo; on a child&apos;s page, and the workbooks stored for print. Open a draft to review its pages.</p>
      <form className="adm-filters" action={ADMIN_WORKBOOKS_PATH} method="get" aria-label="Filters">
        <label>Status
          <select name="status" defaultValue={filter}>
            {LIST_FILTERS.map((f) => <option key={f} value={f}>{FILTER_TEXT[f]}</option>)}
          </select>
        </label>
        <button type="submit" className="btn adm-btn">Show</button>
      </form>
      {preparing && <RunRefresh />}
      <Table label="Workbooks" head={["Child", "Workbook", "Status", "Check results", "Started (Pacific)", "By"]} empty={filter === "all" ? "No workbooks yet. Open a child and press Prepare next workbook." : "No workbooks with this status."}>
        {rows.map((r) => r.kind === "run" ? (
          <tr key={r.row.run.id}>
            <td><Link href={childPath(r.childId)}>{childName(children, r.childId)}</Link></td>
            <td className="adm-nowrap"><Link href={adminWorkbookRunPath(r.row.run.id)}>Draft of workbook {r.row.run.number}</Link></td>
            <td><StateCell run={r.row.run} now={now} /></td>
            <td><ChecksCell counts={r.row.counts} notRendered={r.row.notRendered} /></td>
            <td className="adm-nowrap">{when(r.row.run.createdAt)}</td>
            <td className="adm-sub">{r.row.run.startedBy.email ?? "Unknown"}</td>
          </tr>
        ) : (
          <tr key={r.workbook.id}>
            <td><Link href={childPath(r.childId)}>{childName(children, r.childId)}</Link></td>
            <td className="adm-nowrap"><Link href={adminWorkbookPath(r.workbook.id)}>Workbook {r.workbook.number}</Link><span className="adm-sub">{levelsText(r.workbook.levels)}</span></td>
            <td><WorkbookStatusChip status={r.workbook.status as WorkbookStatus} /></td>
            <td><span className="adm-sub">Stored for print</span></td>
            <td className="adm-nowrap">{when(r.workbook.createdAt)}</td>
            <td className="adm-sub">-</td>
          </tr>
        ))}
      </Table>
      {more && <p className="adm-note">Showing the newest 500 runs and workbooks.</p>}
    </AdminFrame>
  );
}

/** The child page's list of runs. */
export function ChildRunsTable({ runs, now }: { runs: RunListRow[]; now: Date }) {
  return <Table label="Workbook drafts" head={["Draft", "Status", "Check results", "Started (Pacific)", "By"]} empty="No drafts yet.">
    {runs.map((r) => <tr key={r.run.id}>
      <td className="adm-nowrap"><Link href={adminWorkbookRunPath(r.run.id)}>Draft of workbook {r.run.number}</Link></td>
      <td><StateCell run={r.run} now={now} /></td>
      <td><ChecksCell counts={r.counts} notRendered={r.notRendered} /></td>
      <td className="adm-nowrap">{when(r.run.createdAt)}</td>
      <td className="adm-sub">{r.run.startedBy.email ?? "Unknown"}</td>
    </tr>)}
  </Table>;
}

// ---------- One run ----------

const PAGE_TYPE: Record<string, string> = {
  cover: "Cover", "how-plan": "How + Plan", "back-cover": "Back cover", blank: "Blank", "parent-led": "Parent-led", "warm-up": "Warm-up",
  "remember-these": "Remember these?", "new-idea": "New idea", practice: "Practice", "practice-2": "Practice 2", "word-problems": "Word problems",
  "math-in-the-world": "Math in the world", "unit-b": "Unit B", "remember-these-mixed-set": "Remember these? Mixed set", "friday-5": "Friday 5",
  challenge: "Challenge", "show-what-you-know": "Show what you know", "level-test": "Level test",
};
const typeText = (t: string) => PAGE_TYPE[t] ?? t;
const partText = (p: string) => p.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** What a page needs from the reviewer: its failed questions, fit problems, render problems and unchecked questions. */
function pageIssues(page: GeneratedPage, problems: RenderProblem[]) {
  const failed = page.questions.filter((q) => q.check.status === "failed");
  const notChecked = page.questions.filter((q) => q.check.status === "not-checked");
  const fit = page.fit.status === "failed" ? page.fit.problems : [];
  return { failed, notChecked, fit, render: problems, bad: failed.length > 0 || fit.length > 0, warn: notChecked.length > 0 || problems.length > 0 };
}

const NO_LAYOUT = /^the template has no layout for a .+ page$/;

function QuestionCheckCell({ q }: { q: GeneratedQuestion }) {
  if (q.check.status === "checked") return <Chip tone="ok">Checked by code</Chip>;
  return <>
    <Chip tone={q.check.status === "failed" ? "bad" : "warn"}>{q.check.status === "failed" ? "Failed" : "Not checked by code"}</Chip>
    <span className="adm-sub">{q.check.reason}</span>
  </>;
}

function DraftQuestionRow({ q, box }: { q: GeneratedQuestion; box: boolean }) {
  const cls = q.check.status === "failed" ? "is-bad" : q.check.status === "not-checked" ? "is-warn" : undefined;
  return <tr className={cls}>
    <td className="adm-num">{q.number}{box && <span className="adm-sub">on image</span>}</td>
    <td className="adm-nowrap">{partText(q.part)}<span className="adm-sub adm-mono">slot {q.slot} · {q.attempts === 1 ? "1 try" : "2 tries"}</span></td>
    {q.package
      ? <PackageCells p={q.package} check={<QuestionCheckCell q={q} />} />
      : <td colSpan={8}><QuestionCheckCell q={q} /> <span className="adm-sub">The AI wrote nothing usable for this slot, so the page has no question here.</span></td>}
  </tr>;
}

function DraftPageImage({ page, image, url }: { page: GeneratedPage; image: DraftRendering["pages"][number]; url: string | undefined }) {
  const title = `Page ${page.number} · ${typeText(page.type)}`;
  const { width, height } = image.image;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const failed = new Set(page.questions.filter((q) => q.check.status === "failed").map((q) => q.number));
  return (
    <figure className="adm-wb-page" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={`${title}, as it would print`} loading="lazy" /> : <figcaption className="adm-empty">The page image did not load.</figcaption>}
      {image.questions.map((q) => (
        <span key={q.number} className={`adm-wb-box${failed.has(q.number) ? " is-bad" : ""}`} aria-hidden="true"
          style={{ left: pct(q.box.x, width), top: pct(q.box.y, height), width: pct(q.box.width, width), height: pct(q.box.height, height) }}>
          {q.number}
        </span>
      ))}
    </figure>
  );
}

function DraftPageSection({ page, detail }: { page: GeneratedPage; detail: NonNullable<RunDetail["draft"]> & { images: Record<string, string> } }) {
  const image = detail.rendering?.pages.find((p) => p.number === page.number);
  const problems = detail.problems.filter((p) => p.page === page.number);
  const issues = pageIssues(page, problems);
  const noLayout = problems.length > 0 && problems.every((p) => NO_LAYOUT.test(p.reason));
  return (
    <section id={`page-${page.number}`} className={`adm-wb-section adm-wb-draft${issues.bad ? " is-bad" : issues.warn ? " is-warn" : ""}`} aria-labelledby={`page-${page.number}-title`}>
      <h2 id={`page-${page.number}-title`}>Page {page.number} <span className="adm-wb-type">{[page.dayLabel, typeText(page.type)].filter(Boolean).join(" · ")}</span></h2>
      <p className="adm-wb-flags">
        {page.fit.status === "failed" && <Chip tone="bad">Does not fit the template</Chip>}
        {page.fit.status === "fits" && !noLayout && <Chip tone="ok">Fits</Chip>}
        {issues.failed.length > 0 && <Chip tone="bad">{issues.failed.length} failed {issues.failed.length === 1 ? "question" : "questions"}</Chip>}
        {issues.notChecked.length > 0 && <Chip tone="warn">{issues.notChecked.length} not checked by code</Chip>}
        {problems.length > 0 && <Chip tone="warn">{noLayout ? "No page layout yet" : "Not rendered"}</Chip>}
        {page.attempts === 2 && <span className="adm-sub">Written again after the fit check</span>}
      </p>
      {issues.fit.length > 0 && <ul className="adm-wb-problems">{issues.fit.map((p, i) => <li key={i}>{p.question ? `Question ${p.question}: ` : ""}{p.reason}</li>)}</ul>}
      <div className={page.questions.length ? "adm-wb-grid" : "adm-wb-solo"}>
        {image ? <DraftPageImage page={page} image={image} url={detail.images[image.image.path]} /> : (
          <div className="adm-wb-missing" role="note">
            <b>{noLayout ? "This page type has no layout yet" : "This page did not render"}</b>
            <ul>{problems.map((p, i) => <li key={i}>{p.question ? `Question ${p.question}: ` : ""}{p.reason}</li>)}</ul>
            {noLayout && <span className="adm-sub">The real page templates (#310) add the layouts. The questions are still checked below.</span>}
            {!problems.length && <span className="adm-sub">No image is stored for this page.</span>}
          </div>
        )}
        {page.questions.length > 0 && (
          <Table label={`Questions on page ${page.number}`} empty="No questions on this page."
            head={["#", "Part", "Question", "Answer", "Check", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
            {page.questions.map((q) => <DraftQuestionRow key={q.number} q={q} box={!!image?.questions.some((b) => b.number === q.number)} />)}
          </Table>
        )}
      </div>
    </section>
  );
}

const ACTION: Record<string, string> = {
  "run-started": "Started preparing", "run-retried": "Tried again after an error", "run-failed": "Failed", "run-stopped": "Stopped a run with no progress",
  "draft-stored": "Stored the draft",
};

function AuditLog({ entries }: { entries: AuditEntry[] }) {
  return <Table label="Audit log" head={["When (Pacific)", "Who", "What", "Details"]} empty="Nothing logged yet.">
    {entries.map((e) => <tr key={e.id}>
      <td className="adm-nowrap">{when(e.at)}</td>
      <td>{e.actor_email ?? <span className="adm-sub">The job</span>}</td>
      <td>{ACTION[e.action] ?? e.action}</td>
      <td className="adm-sub adm-mono">{Object.entries(e.detail).map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ")}</td>
    </tr>)}
  </Table>;
}

/** One run: its state, then its draft page by page, then the audit log. `only`: only the pages that need attention. */
export function AdminWorkbookRun({ email, detail, now, only }: { email: string; detail: RunDetail; now: Date; only: boolean }) {
  const { run, child, draft } = detail;
  const state = runState(run, now);
  const name = child?.first_name ?? "Child";
  const pages = draft?.workbook.pages ?? [];
  const attention = pages.filter((p) => {
    const i = pageIssues(p, draft!.problems.filter((x) => x.page === p.number));
    return i.bad || i.warn;
  });
  const failedPages = attention.filter((p) => pageIssues(p, []).bad);
  const shown = only ? attention : pages;
  const counts = draft && { ...draft.workbook.counts };
  const notRendered = draft ? new Set(draft.problems.map((p) => p.page)).size : null;
  return (
    <AdminFrame email={email} section="workbooks" title={`${name}: draft of workbook ${run.number}`}>
      {(state === "preparing" || state === "waiting") && <RunRefresh />}
      <RecordFacts facts={[
        ["Child", <Link key="child" href={childPath(run.childId)}>{name}</Link>],
        ["Status", <span key="state" className="adm-wb-state"><RunStateChip state={state} />{(state === "preparing" || state === "waiting") && <RunProgress run={run} />}</span>],
        ["Started (Pacific)", `${when(run.createdAt)} by ${run.startedBy.email ?? "unknown"}`],
        ["Finished (Pacific)", run.finishedAt ? when(run.finishedAt) : "Not yet"],
        ["Attempts", `${run.attempts} of ${run.maxAttempts}`],
        ...(draft ? [
          ["Levels", levelsText(draft.workbook.levels)] as [string, ReactNode],
          ["Pages", `${draft.workbook.pages.length} pages · revision ${draft.revision}`] as [string, ReactNode],
          ["AI model", draft.workbook.model] as [string, ReactNode],
          ["Profile build", draft.workbook.profileBuild ?? "None"] as [string, ReactNode],
        ] : []),
      ]} />

      {(state === "failed" || state === "stopped") && (
        <div className="adm-wb-alert" role="alert">
          <b>{state === "failed" ? "This run failed." : "This run stopped without finishing."}</b>
          <p>{run.error ?? "It made no progress for 6 minutes, so it stopped. Its writes are no longer used."}</p>
          {run.errors.length > 0 && <ol className="adm-wb-list">{run.errors.map((e, i) => <li key={i}><span className="adm-sub">Attempt {e.attempt}, {when(e.at)}</span> {e.error}</li>)}</ol>}
          <p className="adm-sub">To try again, press Prepare next workbook on <Link href={childPath(run.childId)}>{name}&apos;s page</Link>.</p>
        </div>
      )}
      {(state === "preparing" || state === "waiting") && <p className="adm-note">This page updates every few seconds. You can leave it: the draft is made in the background.</p>}

      {draft && counts && <>
        <h2>Check results</h2>
        <p><ChecksCell counts={{ pages: counts.pages, questions: counts.questions, failed: counts.failed, notChecked: counts.notChecked, failedPages: counts.failedPages }} notRendered={notRendered} /></p>
        {attention.length > 0 ? <>
          <p className="adm-note">Pages that need attention: {attention.map((p, i) => <span key={p.number}>{i > 0 && ", "}<a href={`#page-${p.number}`} className={failedPages.includes(p) ? "adm-wb-bad-link" : undefined}>{p.number}</a></span>)}</p>
          <nav className="adm-row" aria-label="Pages shown">
            {only ? <Link href={adminWorkbookRunPath(run.id)}>Show every page</Link> : <Link href={`${adminWorkbookRunPath(run.id)}?only=attention`}>Show only the {attention.length} pages that need attention</Link>}
          </nav>
        </> : <p className="adm-note">Every question was checked by code, and every page fits and rendered.</p>}
        {draft.rendering && <p className="adm-note adm-mono">PDF of the pages that rendered: {draft.rendering.pdfPath}</p>}
        {shown.map((p) => <DraftPageSection key={p.number} page={p} detail={{ ...draft, images: detail.images }} />)}
      </>}

      <h2>Audit log</h2>
      <AuditLog entries={detail.audit} />
    </AdminFrame>
  );
}
