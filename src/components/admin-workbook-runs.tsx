// The admin Workbooks area (#312): the list of workbooks by child and status with their check results, and one run's
// page: its progress or its error, then its draft for review, page by page, the page image beside each question's
// data. Failed questions, pages that failed the fit check, pages that did not render and questions code could not
// check are marked on the page and listed at the top, with the solve check's results (#380 round 7: the questions a
// separate reader answered otherwise than the key, with both answers, and who wrote each printed text). Server components; the refresh while a run works and the
// "Prepare next workbook" button are the only client parts.
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditEntry, ChildRow, DraftCounts, RunDetail, RunListRow, WorkerStatus } from "@/lib/admin-store";
import { ADMIN_WORKBOOKS_PATH, adminWorkbookPath, adminWorkbookRunPath, draftPdfPath, when } from "@/lib/admin-view";
import type { WorkbookStatus, WorkbookSummary } from "@/lib/workbook-content";
import type { GeneratedPage, GeneratedQuestion } from "@/lib/workbook-generator";
import { isCodeWorded } from "@/lib/workbook-generator-items";
import { runState, type DraftRendering, type RunSolve, type RunState, type RunStep, type WorkbookRun } from "@/lib/workbook-job";
import type { RenderProblem } from "@/lib/workbook-render";
import { AdminFrame, Chip, Table, type Tone } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";
import { PackageCells, WorkbookStatusChip } from "@/components/admin-workbook";
import { RunRefresh } from "@/components/admin-run-refresh";
import { RunOnServer } from "@/components/run-on-server";
import type { AiCallSummary } from "@/lib/workbook-ai";
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
    <span className="adm-sub">{run.step ? STEP[run.step] : "Starting"}{total > 0 && ` · ${done} of ${total} day pages`}{run.attempts > 1 && ` · try ${run.attempts} of ${run.maxAttempts}`}</span>
    {total > 0 && <progress max={total} value={done} aria-label={`${done} of ${total} day pages written`} />}
  </span>;
}

/** The check results of a draft, in plain words: what failed, what a person must check by hand, and how many answers
 * passed the math check (code worked the answer out again and got the same). */
export function ChecksCell({ counts, notRendered, oldFormat = false }: { counts: DraftCounts | null; notRendered: number | null; oldFormat?: boolean }): ReactNode {
  if (!counts) return <span className="adm-sub">No draft yet</span>;
  if (oldFormat) return <span className="adm-wb-checks"><Chip tone="muted">Old draft format</Chip><span className="adm-sub">Made before the page layouts. Prepare a new draft to review it.</span></span>;
  const checked = counts.questions - counts.failed - counts.notChecked;
  return <span className="adm-wb-checks">
    {counts.failed > 0 ? <Chip tone="bad">{counts.failed} {counts.failed === 1 ? "question failed" : "questions failed"}</Chip> : <Chip tone="ok">No failed questions</Chip>}
    {counts.failedPages > 0 && <Chip tone="bad">{counts.failedPages} {counts.failedPages === 1 ? "page does" : "pages do"} not fit</Chip>}
    {counts.notChecked > 0 && <Chip tone="warn">{counts.notChecked} to check by hand</Chip>}
    {notRendered ? <Chip tone="bad">{notRendered} {notRendered === 1 ? "page" : "pages"} missing from the PDF</Chip> : null}
    <span className="adm-sub">Math check passed for {checked} of {counts.questions} questions</span>
  </span>;
}

const childName = (children: Map<string, ChildRow>, id: string) => children.get(id)?.first_name ?? "Unknown child";

/** The run's state cell: the chip, and the progress or the error. */
function StateCell({ run, now }: { run: WorkbookRun; now: Date }) {
  const state = runState(run, now);
  if (state === "waiting" && run.runner === "mac") return <><RunStateChip state={state} /><span className="adm-sub">Waiting for the Mac</span></>;
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
      <Table label="Workbooks" head={["Child", "Workbook", "Status", "Checks", "Started (Pacific)", "By"]} empty={filter === "all" ? "No workbooks yet. Open a child and press Prepare next workbook." : "No workbooks with this status."}>
        {rows.map((r) => r.kind === "run" ? (
          <tr key={r.row.run.id}>
            <td><Link href={childPath(r.childId)}>{childName(children, r.childId)}</Link></td>
            <td className="adm-nowrap"><Link href={adminWorkbookRunPath(r.row.run.id)}>Draft of workbook {r.row.run.number}</Link></td>
            <td><StateCell run={r.row.run} now={now} /></td>
            <td><ChecksCell counts={r.row.counts} notRendered={r.row.notRendered} oldFormat={r.row.oldFormat} /></td>
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
  return <Table label="Workbook drafts" head={["Draft", "Status", "Checks", "Started (Pacific)", "By"]} empty="No drafts yet.">
    {runs.map((r) => <tr key={r.run.id}>
      <td className="adm-nowrap"><Link href={adminWorkbookRunPath(r.run.id)}>Draft of workbook {r.run.number}</Link></td>
      <td><StateCell run={r.run} now={now} /></td>
      <td><ChecksCell counts={r.counts} notRendered={r.notRendered} oldFormat={r.oldFormat} /></td>
      <td className="adm-nowrap">{when(r.run.createdAt)}</td>
      <td className="adm-sub">{r.run.startedBy.email ?? "Unknown"}</td>
    </tr>)}
  </Table>;
}

// ---------- Where runs are made (D-200) ----------

/** The workbook worker on Savar's Mac: online, or when it was last seen. */
export function WorkerLine({ worker }: { worker: WorkerStatus | null }) {
  if (!worker) return <span className="adm-wb-worker"><Chip tone="warn">Mac worker offline</Chip><span className="adm-sub">It has never run. See docs/workbook-worker.md to start it.</span></span>;
  return worker.online
    ? <span className="adm-wb-worker"><Chip tone="ok">Mac worker online</Chip><span className="adm-sub">Seen {when(worker.seenAt)}{worker.runId ? " · making a workbook" : " · ready"} · {worker.primaryAi === "api" ? "API first" : "Claude subscription first"}</span></span>
    : <span className="adm-wb-worker"><Chip tone="warn">Mac worker offline</Chip><span className="adm-sub">Not seen since {when(worker.seenAt)}</span></span>;
}

const usd = (n: number) => `USD ${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;

/** The run's AI calls by provider: on the Claude subscription (free), on the API (with its cost). */
export function aiCallsFact(s: AiCallSummary): ReactNode {
  const total = s.subscription.calls + s.api.calls;
  if (total === 0 && s.unavailable.subscription + s.unavailable.api === 0) return "No AI calls logged yet";
  const failed = (n: number) => (n > 0 ? ` (${n} failed)` : "");
  return <span className="adm-wb-calls">
    <span><b>{s.subscription.calls}</b> on the Claude subscription{failed(s.subscription.failed)} · USD 0</span>
    <span><b>{s.api.calls}</b> on the API{failed(s.api.failed)} · {usd(s.api.usd)}{s.api.noCost > 0 ? ` (${s.api.noCost} with no cost given)` : ""}</span>
    {s.unavailable.subscription > 0 && <span className="adm-sub">The subscription could not take {s.unavailable.subscription} {s.unavailable.subscription === 1 ? "call" : "calls"}, so they went to the API. Last reason: {s.unavailable.last ?? "not given"}</span>}
    {s.unavailable.api > 0 && <span className="adm-sub">The API could not take {s.unavailable.api} {s.unavailable.api === 1 ? "call" : "calls"}.</span>}
  </span>;
}

/** Where the run is made. */
const runnerText = (run: WorkbookRun) => (run.runner === "mac" ? "Savar's Mac (the workbook worker)" : "The server (the API)");

/** A run for the Mac that no one is making: it waits for the worker, or the admin runs it on the server. */
function MacWait({ run, state, worker }: { run: WorkbookRun; state: RunState; worker: WorkerStatus | null }) {
  const stalled = state === "stopped" && run.status === "running";
  if (run.runner !== "mac" || (state !== "waiting" && !stalled)) return null;
  if (worker?.online) {
    return <p className="adm-note" role="status">{stalled ? "The Mac worker is online and takes this run up again where it stopped." : "The Mac worker is online. It starts this run in a few seconds."}</p>;
  }
  return <div className="adm-wb-wait" role="status">
    <b>{stalled ? "This run stopped, and the Mac is offline." : "Waiting for the Mac."}</b>
    <p>The workbook worker on Savar&apos;s Mac {worker ? `was last seen ${when(worker.seenAt)}` : "has never run"}. The run starts when the Mac is back, on the Claude subscription. To make it now instead, run it on the server with the paid API.</p>
    <RunOnServer runId={run.id} />
  </div>;
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
  // A draft made before the page layouts (shape version 1) has no omissions.
  const omitted = (page.omissions ?? []).length > 0;
  return { failed, notChecked, fit, render: problems, bad: failed.length > 0 || fit.length > 0 || problems.length > 0, warn: notChecked.length > 0 || omitted };
}

const NO_LAYOUT = /^the template has no layout for a .+ page$/;

/** A problem as one line: "Question 3: ..." only when the reason does not name the question already. */
const reasonText = (p: { question: number | null; reason: string }) =>
  p.question && !p.reason.toLowerCase().includes(`question ${p.question}`) ? `Question ${p.question}: ${p.reason}` : p.reason;

/** A page's problems, each once: the first few, then the rest behind "Show all". */
function ProblemList({ reasons }: { reasons: string[] }) {
  const unique = [...new Set(reasons)];
  if (unique.length === 0) return null;
  const SHOWN = 3;
  return <div className="adm-wb-problems">
    <ul>{unique.slice(0, SHOWN).map((r) => <li key={r}>{r}</li>)}</ul>
    {unique.length > SHOWN && <details><summary>Show all {unique.length} problems</summary><ul>{unique.slice(SHOWN).map((r) => <li key={r}>{r}</li>)}</ul></details>}
  </div>;
}

// ---------- The solve check (#380 round 7) ----------

/** Who wrote a question's printed words: code (a relation, or a whole-number operation at U1 to U9) or the AI. */
export const wordedBy = (q: GeneratedQuestion): "code" | "AI" | null =>
  !q.package ? null : isCodeWorded(q.package) || (q.package.item?.checks ?? []).some((c) => c.kind === "relation") ? "code" : "AI";

/** A question that failed because the solve check read it otherwise than the key, or could not confirm it. */
const failedSolve = (q: GeneratedQuestion) => q.check.status === "failed" && q.check.reason.startsWith("the solve check");

/** The check of the question as the draft prints it: the last one of its text, else its last one. */
function solveOf(q: GeneratedQuestion, solves: Map<string, RunSolve[]>): RunSolve | undefined {
  const all = q.package ? solves.get(q.package.id) ?? [] : [];
  return all.findLast((x) => x.log.questions[0]?.text === q.package!.text) ?? all.at(-1);
}

/** What the reader wrote in each box, and what the key says, as short lines ("Box a: 13"). */
function solveAnswers(x: RunSolve): { reader: string[]; key: string[] } {
  let given: { question?: string; box?: string; answer?: unknown }[] = [];
  try {
    const parsed = JSON.parse(x.log.answers) as { answers?: unknown };
    if (Array.isArray(parsed?.answers)) given = parsed.answers as typeof given;
  } catch {
    given = [];
  }
  // A question with one answer box names it "answer": then the line is "Answer: 13"; else "Box a: 13".
  const label = (k: { question: string; box: string }) => k.question === "easier" ? "Easier example" : k.box === "answer" ? "Answer" : `Box ${k.box}`;
  return {
    reader: x.log.key.map((k) => {
      const a = given.find((g) => g.question === k.question && g.box === k.box)?.answer;
      return `${label(k)}: ${typeof a === "string" ? a : "no answer"}`;
    }),
    key: x.log.key.map((k) => `${label(k)}: ${k.right[0]}`),
  };
}

/** The checking AI's work in one line: how many checks, by which model, how many answers differed or erred, and the
 * cost. A question rewritten after a different answer is checked again, so this counts checks, not questions. */
function solveFact(solves: RunSolve[], left: number | null): string {
  if (solves.length === 0) return "No checks yet";
  const models = [...new Set(solves.map((x) => x.model))].join(", ");
  const disagreed = solves.filter((x) => x.verdict === "disagreed").length;
  const failed = solves.filter((x) => x.verdict === "failed").length;
  const costed = solves.filter((x) => x.usd !== null);
  const usd = costed.reduce((n, x) => n + x.usd!, 0);
  const cost = costed.length === 0 ? "cost unknown" : `USD ${usd.toFixed(4)}${costed.length < solves.length ? ` (${solves.length - costed.length} with cost unknown)` : ""}`;
  return `${solves.length} ${solves.length === 1 ? "check" : "checks"} by ${models} · ${disagreed} different ${disagreed === 1 ? "answer" : "answers"}${left !== null && disagreed > 0 ? ` (${left} left after rewrites)` : ""} · ${failed} ${failed === 1 ? "error" : "errors"} · ${cost}`;
}

/** The questions of the draft that failed the solve check, with what the reader answered and the key. */
function SolveFailures({ pages, solves }: { pages: GeneratedPage[]; solves: Map<string, RunSolve[]> }) {
  const rows = pages.flatMap((p) => p.questions.filter(failedSolve).map((q) => ({ p, q, x: solveOf(q, solves) })));
  if (rows.length === 0) return null;
  return <>
    <h3>The checking AI got a different answer</h3>
    <p className="adm-note">A second AI answered each question the AI wrote, from the printed words and picture only. For {rows.length === 1 ? "this question" : `these ${rows.length} questions`}, its answer was still different from the correct answer after the AI rewrote {rows.length === 1 ? "it" : "them"}.</p>
    <Table label="Questions where the checking AI got a different answer" head={["Page", "#", "Question", "Checking AI's answer", "Correct answer", "Checked by"]} empty="None.">
      {rows.map(({ p, q, x }) => {
        const answers = x ? solveAnswers(x) : null;
        return <tr key={`${p.number}-${q.number}`} className="is-bad">
          <td className="adm-num"><a href={`#page-${p.number}`}>{p.number}</a></td>
          <td className="adm-num">{q.number}</td>
          <td><span className="adm-wb-text">{q.package?.text ?? "No question"}</span>{(x?.log.questions.length ?? 0) > 1 && <span className="adm-sub">Easier example: {x!.log.questions[1].text}</span>}</td>
          <td>{x?.verdict === "failed" ? <span className="adm-sub">{x.log.verdict.status === "agreed" ? "" : x.log.verdict.reason}</span> : <ul className="adm-wb-list">{answers?.reader.map((l) => <li key={l}>{l}</li>)}</ul>}</td>
          <td><ul className="adm-wb-list">{answers?.key.map((l) => <li key={l}>{l}</li>)}</ul></td>
          <td className="adm-nowrap"><span className="adm-sub">{x ? `${x.model} · ${(x.ms / 1000).toFixed(1)} s${x.usd !== null ? ` · USD ${x.usd.toFixed(4)}` : ""}` : "No check saved"}</span></td>
        </tr>;
      })}
    </Table>
  </>;
}

function QuestionCheckCell({ q, solve }: { q: GeneratedQuestion; solve?: RunSolve }) {
  const read = solve && !failedSolve(q) && <span className="adm-sub">{solve.verdict === "agreed" ? "Checking AI agreed" : `Checking AI, on an earlier wording: ${solve.log.verdict.status === "agreed" ? "agreed" : solve.log.verdict.reason}`}</span>;
  if (q.check.status === "checked") return <><Chip tone="ok">Math check passed</Chip>{read}</>;
  return <>
    <Chip tone={q.check.status === "failed" ? "bad" : "warn"}>{q.check.status === "failed" ? failedSolve(q) ? "Checking AI disagreed" : "Failed" : "Check by hand"}</Chip>
    <span className="adm-sub">{q.check.reason}</span>
    {read}
  </>;
}

function DraftQuestionRow({ q, box, solve }: { q: GeneratedQuestion; box: boolean; solve?: RunSolve }) {
  const cls = q.check.status === "failed" ? "is-bad" : q.check.status === "not-checked" ? "is-warn" : undefined;
  const words = wordedBy(q);
  return <tr className={cls}>
    <td className="adm-num">{q.number}{box && <span className="adm-sub">on image</span>}</td>
    <td className="adm-nowrap">{partText(q.part)}<span className="adm-sub adm-mono">slot {q.slot} · {q.attempts} {q.attempts === 1 ? "try" : "tries"}</span>{words && <span className="adm-sub">{words === "AI" ? "Written by the AI" : "Made from a fixed pattern"}</span>}</td>
    {q.package
      ? <PackageCells p={q.package} check={<QuestionCheckCell q={q} solve={solve} />} />
      : <td colSpan={8}><QuestionCheckCell q={q} /> <span className="adm-sub">The AI wrote nothing usable for this slot, so the page has no question here.</span></td>}
  </tr>;
}

function DraftPageImage({ page, image, url }: { page: GeneratedPage; image: DraftRendering["pages"][number]; url: string | undefined }) {
  const title = `Page ${page.number} · ${typeText(page.type)}`;
  const { width, height } = image.image;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const failed = new Set(page.questions.filter((q) => q.check.status === "failed").map((q) => q.number));
  return (
    <figure className={`adm-wb-page${image.proof ? " is-proof" : ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
      {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={image.proof ? `${title}: proof with its failure marked` : `${title}, as it would print`} loading="lazy" /> : <figcaption className="adm-empty">The page image did not load.</figcaption>}
      {image.questions.map((q) => (
        <span key={q.number} className={`adm-wb-box${failed.has(q.number) ? " is-bad" : ""}`} aria-hidden="true"
          style={{ left: pct(q.box.x, width), top: pct(q.box.y, height), width: pct(q.box.width, width), height: pct(q.box.height, height) }}>
          {q.number}
        </span>
      ))}
    </figure>
  );
}

function DraftPageSection({ page, detail, solves }: { page: GeneratedPage; detail: NonNullable<RunDetail["draft"]> & { images: Record<string, string> }; solves: Map<string, RunSolve[]> }) {
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
        {issues.notChecked.length > 0 && <Chip tone="warn">{issues.notChecked.length} to check by hand</Chip>}
        {problems.length > 0 && <Chip tone="bad">{noLayout ? "No page layout" : "Not in the PDF"}</Chip>}
        {(page.omissions ?? []).length > 0 && <Chip tone="warn">{(page.omissions ?? []).reduce((n, o) => n + o.requested - o.placed, 0)} planned items left out</Chip>}
        {page.attempts === 2 && <span className="adm-sub">Written again after the fit check</span>}
      </p>
      <ProblemList reasons={[...issues.fit, ...problems].map(reasonText)} />
      {(page.omissions ?? []).length > 0 && <ul className="adm-wb-problems adm-sub">{(page.omissions ?? []).map((o, i) => <li key={`o${i}`}>{partText(o.kind)}: {o.placed} of {o.requested} placed ({o.reason})</li>)}</ul>}
      <div className={page.questions.length ? "adm-wb-grid" : "adm-wb-solo"}>
        {image ? (
          <div className="adm-wb-figure">
            <DraftPageImage page={page} image={image} url={detail.images[image.image.path]} />
            {image.proof && <p className="adm-sub">Proof image: this page is not in the PDF. The red marks show why. It is never printed.</p>}
          </div>
        ) : (
          <div className="adm-wb-missing" role="note">
            <b>{noLayout ? "This page type has no layout" : "This page could not be drawn"}</b>
            {!problems.length && <span className="adm-sub">No image is stored for this page.</span>}
          </div>
        )}
        {page.questions.length > 0 && (
          <Table label={`Questions on page ${page.number}`} empty="No questions on this page."
            head={["#", "Part", "Question", "Answer", "Check", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
            {page.questions.map((q) => <DraftQuestionRow key={q.number} q={q} box={!!image?.questions.some((b) => b.number === q.number)} solve={solveOf(q, solves)} />)}
          </Table>
        )}
      </div>
    </section>
  );
}

/** "Open workbook PDF", or with the page count when some pages are not in it; plain text when there is no PDF. */
function DraftPdfLink({ runId, draft, rendering, pages }: { runId: string; draft: boolean; rendering: DraftRendering | null; pages: number }) {
  if (!rendering?.pdfPath) return <p className="adm-note">{draft ? "No PDF: no page could be drawn." : "No PDF yet."}</p>;
  const inPdf = rendering.pages.filter((p) => !p.proof).length;
  return <p className="adm-row adm-wb-pdf">
    <a className="btn adm-btn" href={draftPdfPath(runId)} target="_blank" rel="noopener">{inPdf < pages ? `Open PDF (${inPdf} of ${pages} pages)` : "Open workbook PDF"}</a>
  </p>;
}

const ACTION: Record<string, string> = {
  "run-started": "Started preparing", "run-retried": "Tried again after an error", "run-failed": "Failed", "run-stopped": "Stopped a run with no progress",
  "draft-stored": "Saved the draft", "run-resumed": "Picked up again after a stop", "run-routed": "Set where the run is made",
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
export function AdminWorkbookRun({ email, detail, now, only, worker }: { email: string; detail: RunDetail; now: Date; only: boolean; worker: WorkerStatus | null }) {
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
  const solves = new Map<string, RunSolve[]>();
  for (const x of detail.solves) solves.set(x.questionId, [...(solves.get(x.questionId) ?? []), x]);
  const questions = pages.flatMap((p) => p.questions);
  const solveFailed = questions.filter(failedSolve).length;
  const byCode = questions.filter((q) => wordedBy(q) === "code").length;
  const byAi = questions.filter((q) => wordedBy(q) === "AI").length;
  return (
    <AdminFrame email={email} section="workbooks" title={`${name}: draft of workbook ${run.number}`}>
      {(state === "preparing" || state === "waiting") && <RunRefresh />}
      <RecordFacts facts={[
        ["Child", <Link key="child" href={childPath(run.childId)}>{name}</Link>],
        ["Status", <span key="state" className="adm-wb-state"><RunStateChip state={state} />{(state === "preparing" || state === "waiting") && <RunProgress run={run} />}</span>],
        ["Started (Pacific)", `${when(run.createdAt)} by ${run.startedBy.email ?? "unknown"}`],
        ["Finished (Pacific)", run.finishedAt ? when(run.finishedAt) : "Not yet"],
        ["Tries", `${run.attempts} of ${run.maxAttempts}${run.resumes > 0 ? ` · taken up again ${run.resumes} ${run.resumes === 1 ? "time" : "times"}` : ""}`],
        ["Made on", run.runner === "mac" ? <span key="runner" className="adm-wb-state">{runnerText(run)}<WorkerLine worker={worker} /></span> : runnerText(run)],
        ["AI calls", aiCallsFact(detail.aiCalls)],
        ["Checking AI", solveFact(detail.solves, draft ? questions.filter((q) => failedSolve(q) && solveOf(q, solves)?.verdict === "disagreed").length : null)],
        ...(draft ? [
          ["Levels", levelsText(draft.workbook.levels)] as [string, ReactNode],
          ["Pages", `${draft.workbook.pages.length} pages${draft.revision > 1 ? ` · version ${draft.revision}` : ""}`] as [string, ReactNode],
          ["Writing AI", draft.workbook.model] as [string, ReactNode],
        ] : []),
      ]} />
      {detail.oldFormat === null && <DraftPdfLink runId={run.id} draft={!!draft} rendering={draft?.rendering ?? null} pages={pages.length} />}

      {(state === "failed" || state === "stopped") && (
        <div className="adm-wb-alert" role="alert">
          <b>{state === "failed" ? "This run failed." : "This run stopped without finishing."}</b>
          <p>{run.error ?? "It made no progress for 6 minutes, so it stopped. Its writes are no longer used."}</p>
          {run.errors.length > 0 && <ol className="adm-wb-list">{run.errors.map((e, i) => <li key={i}><span className="adm-sub">Try {e.attempt}, {when(e.at)}</span> {e.error}</li>)}</ol>}
          <p className="adm-sub">To try again, press Prepare next workbook on <Link href={childPath(run.childId)}>{name}&apos;s page</Link>.</p>
        </div>
      )}
      <MacWait run={run} state={state} worker={worker} />
      {(state === "preparing" || state === "waiting") && <p className="adm-note">This page updates every few seconds. You can leave it: the draft is made in the background.</p>}

      {detail.oldFormat !== null && (
        <p className="adm-note" role="note"><Chip tone="muted">Old draft format</Chip> This draft was stored in an older format (version {detail.oldFormat}), so its pages are not shown here. Prepare a new draft to review the pages.</p>
      )}
      {draft && counts && <>
        <h2>Check results</h2>
        <p><ChecksCell counts={{ pages: counts.pages, questions: counts.questions, failed: counts.failed, notChecked: counts.notChecked, failedPages: counts.failedPages }} notRendered={notRendered} /></p>
        <p className="adm-wb-checks">
          {solveFailed > 0 ? <Chip tone="bad">{solveFailed} answered differently by the checking AI</Chip> : <Chip tone="ok">The checking AI agreed on every question</Chip>}
          <span className="adm-sub">{[byAi > 0 && `${byAi} questions written by the AI`, byCode > 0 && `${byCode} made from a fixed pattern`].filter(Boolean).join(", ")}</span>
        </p>
        <SolveFailures pages={pages} solves={solves} />
        {attention.length > 0 ? <>
          <p className="adm-note">Pages that need attention: {attention.map((p, i) => <span key={p.number}>{i > 0 && ", "}<a href={`#page-${p.number}`} className={failedPages.includes(p) ? "adm-wb-bad-link" : undefined}>{p.number}</a></span>)}</p>
          <nav className="adm-row" aria-label="Pages shown">
            {only ? <Link href={adminWorkbookRunPath(run.id)}>Show every page</Link> : <Link href={`${adminWorkbookRunPath(run.id)}?only=attention`}>Show only the {attention.length} pages that need attention</Link>}
          </nav>
        </> : <p className="adm-note">Every question passed its checks, and every page fits and is in the PDF.</p>}
        {shown.map((p) => <DraftPageSection key={p.number} page={p} detail={{ ...draft, images: detail.images }} solves={solves} />)}
      </>}

      <h2>Audit log</h2>
      <AuditLog entries={detail.audit} />
    </AdminFrame>
  );
}
