// The admin Workbooks area (#312): the child page's list of runs with their check results, and one run's page (D-315):
// its header and progress or its error, the check results with the approval, the draft's pages as thumbnails, then
// its draft for review, page by page, the page image beside each question's data. Failed
// questions, pages that failed the fit check, pages that did not render and questions code could not check are marked
// on the page and listed at the top, with the solve check's results (#380 round 7: the questions a separate reader
// answered otherwise than the key, with both answers, and who wrote each printed text). Server components; the refresh
// while a run works and the "Prepare next workbook" button are the only client parts. The Production list is
// admin-production.tsx.
import Link from "next/link";
import { WorkbookCommentReviewer } from "@/components/workbook-comment-reviewer";
import type { ReactNode } from "react";
import type { DraftCounts, RunDetail, RunListRow, WorkerStatus } from "@/lib/admin-store";
import { adminWorkbookPath, adminWorkbookRunPath, draftPdfPath, when } from "@/lib/admin-view";
import type { GeneratedPage, GeneratedQuestion } from "@/lib/workbook-generator";
import { isCodeWorded } from "@/lib/workbook-generator-items";
import { runState, STALE_SECONDS, type DraftRendering, type RunSolve, type RunState, type WorkbookRun } from "@/lib/workbook-job";
import { plainRunError, runProgress, type RunActivity } from "@/lib/workbook-run-progress";
import type { RenderProblem } from "@/lib/workbook-render";
import { plainProblem, plainReason } from "@/lib/workbook-reason";
import { toSolve } from "@/lib/workbook-solve-check";
import { failedBySolve, plainModel, QUESTION_SOLVE_TEXT, questionSolveState, solveCostLine, solveSummary, solveTableText, type SolveState, type SolveSummary } from "@/lib/workbook-solve-summary";
import { Chip, Table, type Tone } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { RecordFacts, childPath } from "@/components/admin-records";
import { BookStageTrack, PackageCells, WorkbookStatusChip } from "@/components/admin-workbook";
import { RunRefresh } from "@/components/admin-run-refresh";
import { RunOnServer } from "@/components/run-on-server";
import { StopWorkbookRun } from "@/components/stop-workbook-run";
import { AuditLog } from "@/components/admin-workbook-audit";
import { ApproveDraft } from "@/components/workbook-ship-actions";
import { approvalProblems } from "@/lib/workbook-ship";
import type { AiCallSummary } from "@/lib/workbook-ai";
import { Fold } from "@/components/admin-fold";
import { workbookStage } from "@/lib/admin-book";
import type { Stage } from "@/lib/admin-production";
import "./admin-workbook.css";
import "./admin-book.css";

const STATE: Record<RunState, [string, Tone]> = {
  waiting: ["Waiting to start", "info"], preparing: ["Preparing", "info"], stopped: ["Stopped", "warn"], failed: ["Failed", "bad"], done: ["Draft ready", "ok"],
};

/** `stoppedBy`: an admin stopped the run on purpose, which is not a problem. */
export const RunStateChip = ({ state, run }: { state: RunState; run: WorkbookRun }) => {
  const active = run.status === "queued" || run.status === "running";
  const text = active && state === "stopped" ? "No progress for 6 minutes" : state === "waiting" && run.runner === "mac" ? "Waiting for the workbook computer" : STATE[state][0];
  return <Chip tone={run.stoppedBy ? "muted" : STATE[state][1]}>{text}</Chip>;
};

const activeRun = (run: WorkbookRun) => run.status === "queued" || run.status === "running";

const levelsText = (levels: number[]) => levels.map((l) => `U${l}`).join(", ");

/** The line for a run no one has taken yet. `worker`: undefined when this page does not know the workbook computer's state. */
export function waitingLine(run: WorkbookRun, worker: WorkerStatus | null | undefined) {
  if (run.runner !== "mac") return "Starting on the server.";
  if (worker === undefined) return "Waiting for the workbook computer.";
  if (!worker) return "Waiting for the workbook computer. It has never run.";
  if (worker.online) return worker.runId && worker.runId !== run.id
    ? "Waiting for the workbook computer. It is making another workbook."
    : "Waiting for the workbook computer. It is online.";
  return `Waiting for the workbook computer. It is offline, last seen ${when(worker.seenAt)} (Pacific).`;
}

/** "Stopped by admin@example.com at Nov 5, 2026, 11:03 AM (Pacific)." */
const stoppedLine = (run: WorkbookRun) => `Stopped by ${run.stoppedBy}${run.finishedAt ? ` at ${when(run.finishedAt)} (Pacific)` : ""}.`;

/** The Stop button, only while the run can be stopped: it is queued or running, also when it has gone quiet. */
const StopButton = ({ run }: { run: WorkbookRun }) => run.status === "queued" || run.status === "running"
  ? <StopWorkbookRun runId={run.id} started={run.status === "running"} pages={run.donePages ?? 0} />
  : null;

/** A run being made: the step and pages, the bar, why a try stopped, whether it is working, and how much is left. */
export function RunProgress({ run, activity, now, worker }: { run: WorkbookRun; activity?: RunActivity; now: Date; worker?: WorkerStatus | null }) {
  if (runState(run, now) === "waiting") return <span className="adm-wb-progress"><span className="adm-sub">{waitingLine(run, worker)}</span></span>;
  const v = runProgress(run, activity, now);
  return <span className="adm-wb-progress">
    <span className="adm-sub">{[v.step, v.pages && `${v.pages.done} of ${v.pages.total} day pages`, v.tries].filter(Boolean).join(" · ")}</span>
    {v.pages && <progress max={v.pages.total} value={v.pages.done} aria-label={`${v.pages.done} of ${v.pages.total} day pages written`} />}
    {v.retry && <span className="adm-sub">{v.retry}</span>}
    <span className={`adm-sub${v.signal.warn ? " adm-wb-signal-warn" : ""}`} role={v.signal.warn ? "status" : undefined}>{v.signal.text}</span>
    <span className="adm-sub adm-wb-left">{v.timeLeft}</span>
  </span>;
}

/** The check results of a draft, in plain words: what failed, what a person must check by hand, and how many answers
 * passed the math check (code worked the answer out again and got the same). */
export function ChecksCell({ counts, notRendered, oldFormat = false }: { counts: DraftCounts | null; notRendered: number | null; oldFormat?: boolean }): ReactNode {
  if (!counts) return <span className="adm-sub">No draft yet</span>;
  if (oldFormat) return <span className="adm-wb-checks"><Chip tone="muted">Old draft format</Chip><span className="adm-sub">Made before the page layouts. Prepare a new draft to review it.</span></span>;
  const checked = counts.questions - counts.failed - counts.notChecked;
  return <span className="adm-wb-checks">
    {counts.failed > 0 ? <Chip tone="bad">{counts.failed} {counts.failed === 1 ? "question needs" : "questions need"} fixing</Chip> : <Chip tone="ok">No questions need fixing</Chip>}
    {counts.failedPages > 0 && <Chip tone="bad">{counts.failedPages} {counts.failedPages === 1 ? "page does" : "pages do"} not fit</Chip>}
    {counts.notChecked > 0 && <Chip tone="warn">{counts.notChecked} to check by hand</Chip>}
    {notRendered ? <Chip tone="bad">{notRendered} {notRendered === 1 ? "page" : "pages"} missing from the PDF</Chip> : null}
    <span className="adm-sub">Math check passed for {checked} of {counts.questions} questions</span>
  </span>;
}

/** Why a run with no error stopped: the rule in runState. */
const STOPPED_TEXT = `It stopped without finishing: no signal from the job for ${STALE_SECONDS / 60} minutes.`;

/** The run's state cell: the chip, and the progress or the error. */
function StateCell({ row, now, worker }: { row: RunListRow; now: Date; worker?: WorkerStatus | null }) {
  const { run, activity } = row;
  const state = runState(run, now);
  return <>
    <RunStateChip state={state} run={run} />
    {(state === "preparing" || state === "waiting") && <RunProgress run={run} activity={activity} now={now} worker={worker} />}
    {run.stoppedBy
      ? <span className="adm-sub">{stoppedLine(run)}</span>
      : (state === "failed" || (state === "stopped" && !activeRun(run))) && <span className="adm-sub">{run.error ? plainRunError(run.error) : STOPPED_TEXT}</span>}
    <StopButton run={run} />
  </>;
}

/** The child page's list of runs. */
export function ChildRunsTable({ runs, now, worker }: { runs: RunListRow[]; now: Date; worker?: WorkerStatus | null }) {
  const preparing = runs.some((r) => activeRun(r.run));
  return <>{preparing && <RunRefresh />}<Table label="Workbook drafts" head={["Draft", "Status", "Checks", "Started (Pacific)", "By"]} empty="No drafts yet.">
    {runs.map((r) => <tr key={r.run.id}>
      <td className="adm-nowrap"><Link href={adminWorkbookRunPath(r.run.id)}>Draft of workbook {r.run.number}</Link></td>
      <td><StateCell row={r} now={now} worker={worker} /></td>
      <td><ChecksCell counts={r.counts} notRendered={r.notRendered} oldFormat={r.oldFormat} /></td>
      <td className="adm-nowrap">{when(r.run.createdAt)}</td>
      <td className="adm-sub">{r.run.startedBy.email ?? "Unknown"}</td>
    </tr>)}
  </Table></>;
}

// ---------- Where runs are made (D-200) ----------

/** The workbook computer (the workbook worker, D-200): online, or when it was last seen. */
export function WorkerLine({ worker }: { worker: WorkerStatus | null }) {
  if (!worker) return <span className="adm-wb-worker"><Chip tone="warn">Workbook computer offline</Chip><span className="adm-sub">It has never run.</span></span>;
  return worker.online
    ? <span className="adm-wb-worker"><Chip tone="ok">Workbook computer online</Chip><span className="adm-sub">Seen {when(worker.seenAt)}{worker.runId ? " · making a workbook" : " · ready"} · {worker.primaryAi === "api" ? "API first" : "Claude subscription first"}</span></span>
    : <span className="adm-wb-worker"><Chip tone="warn">Workbook computer offline</Chip><span className="adm-sub">Not seen since {when(worker.seenAt)}</span></span>;
}

const usd = (n: number) => `USD ${n.toFixed(n > 0 && n < 0.01 ? 4 : 2)}`;

/** The run's AI calls by provider: on the Claude subscription (free), on the API (with its cost). */
export function aiCallsFact(s: AiCallSummary): ReactNode {
  const total = s.subscription.calls + s.api.calls;
  if (total === 0 && s.incomplete === 0 && s.unavailable.subscription + s.unavailable.api === 0) return "No AI calls logged yet";
  const failed = (n: number) => (n > 0 ? ` (${n} failed)` : "");
  return <span className="adm-wb-calls">
    <span><b>{s.subscription.calls}</b> calls on the Claude subscription{failed(s.subscription.failed)} · USD 0</span>
    <span><b>{s.api.calls}</b> calls on the API{failed(s.api.failed)} · {usd(s.api.usd)}{s.api.noCost > 0 ? ` (${s.api.noCost} with no cost given)` : ""}</span>
    <span className="adm-sub">A call counts once, however many times it was sent. API retries: {s.retries}.</span>
    {s.incomplete > 0 && <span className="adm-sub">{s.incomplete} {s.incomplete === 1 ? "call has" : "calls have"} no saved result. Their costs are unknown.</span>}
    {s.unavailable.subscription > 0 && <span className="adm-sub">The subscription could not take {s.unavailable.subscription} {s.unavailable.subscription === 1 ? "call" : "calls"}. Last reason: {s.unavailable.last ?? "not given"}</span>}
    {s.unavailable.api > 0 && <span className="adm-sub">The API could not take {s.unavailable.api} {s.unavailable.api === 1 ? "call" : "calls"}.</span>}
  </span>;
}

/** Where the run is made. */
const runnerText = (run: WorkbookRun) => (run.runner === "mac" ? "The workbook computer" : "The server, on the paid API");

/** A run for the workbook computer that no one is making: it waits for it, or the admin runs it on the server. */
function MacWait({ run, state, worker }: { run: WorkbookRun; state: RunState; worker: WorkerStatus | null }) {
  const stalled = state === "stopped" && run.status === "running";
  if (run.runner !== "mac" || (state !== "waiting" && !stalled)) return null;
  if (worker?.online) {
    return <p className="adm-note" role="status">{waitingLine(run, worker)}</p>;
  }
  return <div className="adm-wb-wait" role="status">
    <b>{stalled ? "No progress for 6 minutes. The workbook computer is offline." : "Waiting for the workbook computer."}</b>
    <p>The workbook computer {worker ? `was last seen ${when(worker.seenAt)}` : "has never run"}. The run starts when it is back, on the Claude subscription. To make it now instead, run it on the server with the paid API.</p>
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
  const omitted = (page.omissions ?? []).length > 0 || (page.leftOut ?? []).length > 0;
  return { failed, notChecked, fit, render: problems, bad: failed.length > 0 || fit.length > 0 || problems.length > 0, warn: notChecked.length > 0 || omitted };
}

const NO_LAYOUT = /^the template has no layout for a .+ page$/;

/** A page's problems, each once in plain words (the technical text in the tooltip): the first few, then the rest
 * behind "Show all". */
function ProblemList({ problems }: { problems: { question: number | null; reason: string }[] }) {
  const lines = new Map<string, string[]>();
  for (const p of problems) {
    const line = plainProblem(p);
    lines.set(line, [...(lines.get(line) ?? []), p.reason]);
  }
  const unique = [...lines];
  if (unique.length === 0) return null;
  const SHOWN = 3;
  const item = ([line, raw]: [string, string[]]) => <li key={line} title={[...new Set(raw)].join("\n")}>{line}</li>;
  return <div className="adm-wb-problems">
    <ul>{unique.slice(0, SHOWN).map(item)}</ul>
    {unique.length > SHOWN && <details><summary>Show all {unique.length} problems</summary><ul>{unique.slice(SHOWN).map(item)}</ul></details>}
  </div>;
}

// ---------- The solve check (#380 round 7) ----------

/** Who wrote a question's printed words: code (a relation, or a whole-number operation at U1 to U9) or the AI. */
export const wordedBy = (q: GeneratedQuestion): "code" | "AI" | null =>
  !q.package ? null : q.package.textSource !== "human" && (isCodeWorded(q.package) || (q.package.item?.checks ?? []).some((c) => c.kind === "relation")) ? "code" : "AI";

/** A question that failed because the solve check read it otherwise than the key, or could not confirm it. */
const failedSolve = (q: GeneratedQuestion) => failedBySolve(q.check) !== null;

/** The last check of the question as the draft prints it, including its picture, boxes and easier example. */
function solveOf(q: GeneratedQuestion, solves: Map<string, RunSolve[]>): RunSolve | undefined {
  const all = q.package ? solves.get(q.package.id) ?? [] : [];
  const printed = q.package ? toSolve(q.package).questions : [];
  return all.findLast((x) => x.log.questions.length === printed.length && printed.every((p, i) => {
    const kept = x.log.questions[i];
    return kept.id === p.id && kept.text === p.text && kept.picture === p.picture && kept.shown === p.shown
      && kept.boxes.length === p.boxes.length && p.boxes.every((box, j) => kept.boxes[j].id === box.id && kept.boxes[j].asks === box.asks);
  }));
}

/** What the reader wrote in each box, and what the key says, as short lines ("Box a: 13"). */
function solveAnswers(x: RunSolve, q: GeneratedQuestion): { reader: string[]; key: string[] } {
  let given: { question?: string; box?: string; answer?: unknown }[] = [];
  try {
    const parsed = JSON.parse(x.log.answers) as { answers?: unknown };
    if (Array.isArray(parsed?.answers)) given = parsed.answers as typeof given;
  } catch {
    given = [];
  }
  const label = (k: { question: string; box: string }) => k.question === "easier" ? "Easier example"
    : q.package?.item?.regions.find((r) => r.id === k.box)?.label ?? "Answer box";
  return {
    reader: x.log.key.map((k) => {
      const a = given.find((g) => g.question === k.question && g.box === k.box)?.answer;
      return `${label(k)}: ${typeof a === "string" ? a : "no answer"}`;
    }),
    key: x.log.key.map((k) => `${label(k)}: ${k.right[0]}`),
  };
}

/** A question's solve check state (R379-1): from its own failed check first, else the verdict of its check. */
const solveStateOf = (q: GeneratedQuestion, solves: Map<string, RunSolve[]>): SolveState => questionSolveState(q.check, solveOf(q, solves)?.verdict);

/** The draft's solve check result, the one state the top box, the chip, the table and the rows share (R379-1). */
function draftSolveSummary(questions: GeneratedQuestion[], solves: Map<string, RunSolve[]>): SolveSummary {
  const states = questions.filter((q) => !q.package || failedSolve(q) || toSolve(q.package).questions.length > 0).map((q) => solveStateOf(q, solves));
  return solveSummary(states, solves.size > 0);
}

/** The checking AI's result in one plain line (the draft's shared state, R379-1), with the API cost: a total only
 * when every cost is known (R379-2). The counts of checks (a rewritten question is checked again), models and errors
 * are in the tooltip. `summary`: null while there is no draft. */
function SolveFact({ solves, summary }: { solves: RunSolve[]; summary: SolveSummary | null }) {
  const errors = solves.filter((x) => x.verdict === "failed").length;
  const disagreed = solves.filter((x) => x.verdict === "disagreed").length;
  const models = [...new Set(solves.map((x) => plainModel(x.model, "Scripted checker")))].join(", ");
  const detail = solves.length === 0 ? undefined : [
    `${solves.length} ${solves.length === 1 ? "check" : "checks"} by ${models}`,
    `${disagreed} different ${disagreed === 1 ? "answer" : "answers"} before rewrites`,
    `${errors} ${errors === 1 ? "check" : "checks"} that couldn't finish`,
  ].join(" · ");
  const asked = new Set(solves.map((x) => x.questionId)).size;
  const line = summary ? summary.line : solves.length === 0 ? "No checks yet" : `${asked} ${asked === 1 ? "question" : "questions"} checked so far`;
  const cost = solveCostLine(solves.map((x) => x.usd));
  return <span title={detail}>{[line, cost].filter(Boolean).join(" · ")}</span>;
}

/** The questions of the draft that failed the solve check, with what the reader answered and the key. */
function SolveFailures({ pages, solves, summary }: { pages: GeneratedPage[]; solves: Map<string, RunSolve[]>; summary: SolveSummary }) {
  const rows = pages.flatMap((p) => p.questions.map((q) => ({ p, q, x: solveOf(q, solves), state: solveStateOf(q, solves) }))
    .filter(({ state }) => state === "disagreed" || state === "errored"));
  const text = solveTableText(summary);
  if (rows.length === 0 || !text) return null;
  return <>
    <h3>{text.heading}</h3>
    <p className="adm-note">{text.note}</p>
    <Table label={text.heading} head={["Page", "#", "Question", "Checking AI's answer", "Correct answer", "Checked by"]} empty="None.">
      {rows.map(({ p, q, x, state }) => {
        const answers = x ? solveAnswers(x, q) : null;
        return <tr key={`${p.number}-${q.number}`} className={state === "disagreed" ? "is-bad" : "is-warn"}>
          <td className="adm-num"><a href={`#page-${p.number}`}>{p.number}</a></td>
          <td className="adm-num">{q.number}</td>
          <td><span className="adm-wb-text">{q.package?.text ?? "No question"}</span>{(x?.log.questions.length ?? 0) > 1 && <span className="adm-sub">Easier example: {x!.log.questions[1].text}</span>}</td>
          <td>{state === "errored" ? <span className="adm-sub" title={q.check.status === "failed" ? q.check.reason : undefined}>{QUESTION_SOLVE_TEXT.errored}</span> : <ul className="adm-wb-list">{answers?.reader.map((l) => <li key={l}>{l}</li>)}</ul>}</td>
          <td><ul className="adm-wb-list">{answers?.key.map((l) => <li key={l}>{l}</li>)}</ul></td>
          <td className="adm-nowrap"><span className="adm-sub" title={x ? `${x.model} · ${(x.ms / 1000).toFixed(1)} s${x.usd !== null ? ` · USD ${x.usd.toFixed(4)}` : " · cost unknown"}` : undefined}>{x ? plainModel(x.model, "Scripted checker") : "No check saved"}</span></td>
        </tr>;
      })}
    </Table>
  </>;
}

function QuestionCheckCell({ q, solve }: { q: GeneratedQuestion; solve?: RunSolve }) {
  // The shared state (R379-1): a check that errored or ran out of time is never a disagreement.
  const state = questionSolveState(q.check, solve?.verdict);
  const solveChip = (state === "disagreed" || state === "errored")
    ? <span title={q.check.status === "failed" ? q.check.reason : solve?.log.verdict.status !== "agreed" ? solve?.log.verdict.reason : undefined}><Chip tone={state === "disagreed" ? "bad" : "warn"}>{QUESTION_SOLVE_TEXT[state]}</Chip></span>
    : null;
  const read = state === "agreed"
    ? <span className="adm-sub">{QUESTION_SOLVE_TEXT.agreed}</span>
    : state === "not-checked" && wordedBy(q) === "AI" ? <span className="adm-sub">{QUESTION_SOLVE_TEXT["not-checked"]}</span> : null;
  const gateChip = q.gate
    ? <span title={q.gate.reason}><Chip tone={q.gate.outcome === "unknown" ? "warn" : "bad"}>{q.gate.outcome === "unknown" ? "Quality gate did not answer" : "Quality gate flagged this question"}</Chip></span>
    : null;
  if (q.check.status === "checked") return <>{gateChip}<Chip tone="ok">Math check passed</Chip>{solveChip}{read}</>;
  return <>
    {gateChip}
    {solveChip ?? <Chip tone={q.check.status === "failed" ? "bad" : "warn"}>{q.check.status === "failed" ? "Needs fixing" : "Check by hand"}</Chip>}
    {q.check.status === "failed"
      ? !failedSolve(q) && <span className="adm-sub" title={q.check.reason}>{plainReason(q.check.reason)}</span>
      : <span className="adm-sub">{q.check.reason}</span>}
    {read}
  </>;
}

function DraftQuestionRow({ q, box, solve }: { q: GeneratedQuestion; box: boolean; solve?: RunSolve }) {
  const cls = q.check.status === "failed" ? "is-bad" : q.check.status === "not-checked" ? "is-warn" : undefined;
  const words = wordedBy(q);
  return <tr className={cls}>
    <td className="adm-num">{q.number}{box && <span className="adm-sub">on image</span>}</td>
    <td className="adm-nowrap" title={`Slot ${q.slot}`}>{partText(q.part)}<span className="adm-sub">{q.attempts === 1 ? "Written once" : `Written ${q.attempts} times`}</span>{words && <span className="adm-sub">{words === "AI" ? "Written by the AI" : "Made from a fixed pattern"}</span>}</td>
    {q.package
      ? <PackageCells p={q.package} check={<QuestionCheckCell q={q} solve={solve} />} />
      : <td colSpan={8}><QuestionCheckCell q={q} /> <span className="adm-sub">The AI wrote nothing usable for this spot, so the page has no question here.</span></td>}
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
        {issues.failed.length > 0 && <Chip tone="bad">{issues.failed.length} {issues.failed.length === 1 ? "question needs" : "questions need"} fixing</Chip>}
        {page.questions.some((q) => q.gate) && <Chip tone="warn">{page.questions.filter((q) => q.gate).length} flagged by a quality gate</Chip>}
        {issues.notChecked.length > 0 && <Chip tone="warn">{issues.notChecked.length} to check by hand</Chip>}
        {problems.length > 0 && <Chip tone="bad">{noLayout ? "No page layout" : "Not in the PDF"}</Chip>}
        {(page.omissions ?? []).length > 0 && <Chip tone="warn">{(page.omissions ?? []).reduce((n, o) => n + o.requested - o.placed, 0)} planned items left out</Chip>}
        {page.attempts === 2 && <span className="adm-sub">Written again after the fit check</span>}
      </p>
      <ProblemList problems={[...issues.fit.map((p) => ({ question: p.question, reason: `fit check: ${p.reason}` })), ...problems]} />
      {(page.omissions ?? []).length > 0 && <ul className="adm-wb-problems adm-sub">{(page.omissions ?? []).map((o, i) => <li key={`o${i}`}>{partText(o.kind)}: {o.placed} of {o.requested} placed ({o.reason})</li>)}</ul>}
      {(page.leftOut ?? []).length > 0 && <ul className="adm-wb-problems adm-sub" aria-label={`Questions left out of page ${page.number}`}>{(page.leftOut ?? []).map((q) => <li key={`l${q.slot}`} title={`Slot ${q.slot}: ${q.reason}`}>Left out to make room: {partText(q.part)}, {q.text ? `"${q.text}"` : "a question with no text"}</li>)}</ul>}
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
  if (!rendering?.pdfPath) return <p className="adm-note adm-wb-full">{draft ? "No PDF: no page could be drawn." : "No PDF yet."}</p>;
  const inPdf = rendering.pages.filter((p) => !p.proof).length;
  return <a className="btn adm-btn" href={draftPdfPath(runId)} target="_blank" rel="noopener">{inPdf < pages ? `Open PDF (${inPdf} of ${pages} pages)` : "Open workbook PDF"}</a>;
}

/**
 * #314: approval of the draft's current version. When every check passes, "Approve for print" (the server checks
 * again); else why it cannot be approved yet. Once approved, a link to the stored workbook, where it is printed and
 * shipped.
 */
function Approval({ detail, name }: { detail: RunDetail; name: string }) {
  const { run, draft, approved } = detail;
  if (!draft) return null;
  if (approved && approved.status !== "draft") {
    return <>
      <Link className="btn adm-btn" href={adminWorkbookPath(approved.id)}>Open workbook {run.number} to print and ship</Link>
      <WorkbookStatusChip status={approved.status} />
    </>;
  }
  const flagged = draft.workbook.pages.flatMap((p) => p.questions).filter((q) => q.gate);
  const flagLine = flagged.length
    ? <p><b>{flagged.length} {flagged.length === 1 ? "question is" : "questions are"} flagged by a quality gate.</b> Read each flag before you approve.</p>
    : null;
  const problems = approvalProblems({
    runId: run.id, runDone: run.status === "done", draftId: draft.workbook.id, revision: draft.revision, oldFormat: false,
    draft: draft.workbook, rendering: draft.rendering, renderProblems: draft.problems,
  });
  if (problems.length) {
    return <div className="adm-note adm-wb-full" role="note">{flagLine}<b>Not ready to approve.</b> Every check must pass first:
      <ul className="adm-wb-list">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>;
  }
  return <>{flagLine}<ApproveDraft runId={run.id} revision={draft.revision} workbookPath={adminWorkbookPath(draft.workbook.id)} child={name} pending={detail.comments.filter(c => ["pending", "failed", "stale"].includes(c.status)).length} /></>;
}

const ICON_OK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const ICON_WARN = <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.5M12 16h.01" /></svg>;
const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`;

/** A draft page as a thumbnail: its image (or why there is none), its title and its check marks. */
function DraftThumb({ page, detail, href = `#page-${page.number}` }: { page: GeneratedPage; detail: NonNullable<RunDetail["draft"]> & { images: Record<string, string> }; href?: string }) {
  const image = detail.rendering?.pages.find((p) => p.number === page.number);
  const problems = detail.problems.filter((p) => p.page === page.number);
  const i = pageIssues(page, problems);
  const noLayout = problems.length > 0 && problems.every((p) => NO_LAYOUT.test(p.reason));
  const marks: { tone: "ok" | "warn" | "bad"; text: string }[] = [
    ...(i.failed.length ? [{ tone: "bad" as const, text: `${i.failed.length} to fix` }] : []),
    ...(i.fit.length ? [{ tone: "bad" as const, text: "Does not fit" }] : []),
    ...(problems.length ? [{ tone: "bad" as const, text: noLayout ? "No layout" : "Not in the PDF" }] : []),
    ...(i.notChecked.length ? [{ tone: "warn" as const, text: `${i.notChecked.length} by hand` }] : []),
    ...(!i.bad && !i.notChecked.length && i.warn ? [{ tone: "warn" as const, text: "Items left out" }] : []),
  ];
  if (!marks.length) marks.push({ tone: "ok", text: page.questions.length ? "Checks passed" : "Fits" });
  return <li className={`bk-thumb${i.bad ? " is-bad" : i.warn ? " is-warn" : ""}`}>
    {image ? <DraftPageImage page={page} image={image} url={detail.images[image.image.path]} />
      : <div className="adm-wb-missing" role="note"><b>{noLayout ? "No page layout" : "Not drawn"}</b></div>}
    <a className="bk-thumb-cap" href={href}>
      <b>Page {page.number}</b>
      <span>{[page.dayLabel, typeText(page.type)].filter(Boolean).join(" · ")}</span>
    </a>
    <span className="bk-marks">{marks.map((m) => <span key={m.text} className={`bk-mark is-${m.tone}`}>{m.tone === "ok" ? ICON_OK : ICON_WARN}{m.text}</span>)}</span>
  </li>;
}

/**
 * One run (D-315): the header with the child, the book, the run's state, its place on the stage track and its
 * progress, with Stop on the right; the check results as chips with the PDF and "Approve for print" on the right; the
 * draft's pages as thumbnails with their check marks; then the comment reviewer and the question data; AI calls and
 * costs and the audit log closed. `only`: only the pages that need attention in the question data.
 */
export function AdminWorkbookRun({ email, detail, now, only, worker, why }: { email: string; detail: RunDetail; now: Date; only: boolean; worker: WorkerStatus | null; why?: ReactNode }) {
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
  const solveResult = draft ? draftSolveSummary(questions, solves) : null;
  const byCode = questions.filter((q) => wordedBy(q) === "code").length;
  const byAi = questions.filter((q) => wordedBy(q) === "AI").length;
  // Format history on the server. Browser and server timezone data can differ after a clock-rule change.
  const history = detail.audit.filter((e) => e.action === "workbook-comments-sent").map((e) => ({ id: e.id,
    text: `${e.actor_email ?? "An admin"} applied ${String(e.detail.comments)} comments on pages ${Array.isArray(e.detail.pages) ? e.detail.pages.join(", ") : ""} · ${when(e.at)} Pacific · Version ${String(e.detail.revision)}`,
  }));
  const active = activeRun(run);
  // This run's place on Production's track: being made, ready to review, or the stored workbook's status.
  const stage: Stage | null = active || state === "waiting" || state === "preparing" ? "making"
    : state === "done" && draft ? detail.approved && detail.approved.status !== "draft" ? workbookStage(detail.approved.status, false) : "review" : null;
  return (
    <AdminFrame email={email} title={`${name}: draft of workbook ${run.number}`}
      lead={draft ? "Check the draft page by page, comment where it needs a change, then approve it for print." : "The draft is made here, page by page. This page shows how far it is."}>
      {active && <RunRefresh />}
      <section className="bk-head" aria-label={`${name}, draft of workbook ${run.number}`}>
        <div className="bk-head-top">
          <span className="bk-who"><b><Link href={childPath(run.childId)}>{name}</Link> · Book {run.number}</b>
            <span>Started {when(run.createdAt)} (Pacific) by {run.startedBy.email ?? "unknown"}{run.finishedAt ? ` · finished ${when(run.finishedAt)}` : ""}</span>
            <span>Tries: {run.attempts} of {run.maxAttempts} allowed{run.resumes > 0 ? ` · taken up again ${run.resumes} ${run.resumes === 1 ? "time" : "times"}` : ""}{draft ? ` · ${draft.workbook.pages.length} pages, ${levelsText(draft.workbook.levels)}${draft.revision > 1 ? `, version ${draft.revision}` : ""}` : ""}</span></span>
          <span className="bk-head-end"><RunStateChip state={state} run={run} /><StopButton run={run} /></span>
        </div>
        {(state === "preparing" || state === "waiting") && <div className="bk-progress"><RunProgress run={run} activity={detail.activity} now={now} worker={worker} /></div>}
        {stage && <BookStageTrack stage={stage} />}
      </section>

      {run.stoppedBy && (
        <p className="adm-note" role="status"><b>{stoppedLine(run)}</b> Its finished pages are not used. To make this workbook, press Prepare next workbook on <Link href={childPath(run.childId)}>{name}&apos;s page</Link>: it starts a new run.</p>
      )}
      {(state === "failed" || (state === "stopped" && !active)) && !run.stoppedBy && (
        <div className="adm-wb-alert" role="alert">
          <b>{state === "failed" ? "This run failed." : "This run stopped without finishing."}</b>
          <p>{run.error ?? `${STOPPED_TEXT} Its writes are no longer used.`}</p>
          {run.errors.length > 0 && <ol className="adm-wb-list">{run.errors.map((e, i) => <li key={i}><span className="adm-sub">Try {e.attempt}, {when(e.at)}</span> {e.error}</li>)}</ol>}
          <p className="adm-sub">To try again, press Prepare next workbook on <Link href={childPath(run.childId)}>{name}&apos;s page</Link>.</p>
        </div>
      )}
      <MacWait run={run} state={state} worker={worker} />
      {active && <p className="adm-note">This page updates every few seconds. You can leave it: the draft is made in the background.</p>}

      {detail.oldFormat !== null && (
        <p className="adm-note" role="note"><Chip tone="muted">Old draft format</Chip> This draft was stored in an older format (version {detail.oldFormat}), so its pages are not shown here. Prepare a new draft to review the pages.</p>
      )}
      {draft?.workbook.gatesUnavailable && <p className="adm-note" role="status">Quality gates unavailable for this run.</p>}
      {draft && counts && <section className="bk-checks" aria-labelledby="bk-checks-h">
        <div className="bk-checks-text">
          <h2 id="bk-checks-h">Check results</h2>
          <ChecksCell counts={{ pages: counts.pages, questions: counts.questions, failed: counts.failed, notChecked: counts.notChecked, failedPages: counts.failedPages }} notRendered={notRendered} />
          <span className="adm-wb-checks">
            {solveResult && <Chip tone={solveResult.tone}>{solveResult.line}</Chip>}
            <span className="adm-sub">{[byAi > 0 && `${byAi} questions written by the AI`, byCode > 0 && `${byCode} made from a fixed pattern`].filter(Boolean).join(", ")}</span>
          </span>
          {attention.length > 0
            ? <p className="adm-note">Pages that need attention: {attention.map((p, i) => <span key={p.number}>{i > 0 && ", "}<a href={`#page-${p.number}`} className={failedPages.includes(p) ? "adm-wb-bad-link" : undefined}>{p.number}</a></span>)}</p>
            : <p className="adm-note">Every question passed its checks, and every page fits and is in the PDF.</p>}
        </div>
        {detail.oldFormat === null && <div className="bk-act">
          <DraftPdfLink runId={run.id} draft={!!draft} rendering={draft.rendering} pages={pages.length} />
          <Approval detail={detail} name={name} />
        </div>}
      </section>}
      {!draft && detail.oldFormat === null && state === "done" && <div className="adm-row adm-wb-pdf"><DraftPdfLink runId={run.id} draft={false} rendering={null} pages={0} /></div>}

      {draft && counts && <>
        {solveResult && <SolveFailures pages={pages} solves={solves} summary={solveResult} />}
        <section className="bk-pages" aria-labelledby="bk-pages-h">
          <div className="bk-section-head"><h2 id="bk-pages-h">Pages</h2><span className="bk-count">{pages.length}</span>
            <p>{attention.length ? `${many(attention.length, "page needs", "pages need")} attention.` : "Every page passed its checks."} A page opens its question data below.</p></div>
          <ul className="bk-thumbs">{pages.map((p) => <DraftThumb key={p.number} page={p} detail={{ ...draft, images: detail.images }}
            // With only the attention pages shown below, a passed page opens its section on the full run page.
            href={shown.includes(p) ? undefined : `${adminWorkbookRunPath(run.id)}#page-${p.number}`} />)}</ul>
        </section>
        <WorkbookCommentReviewer detail={detail} history={history} />
        <Fold title="Question data and check details" hint={only ? `Only the ${attention.length} pages that need attention` : `Every page: ${many(questions.length, "question", "questions")} with answers, steps, skills and checks`}>
          {attention.length > 0 && <nav className="adm-row" aria-label="Pages shown">
            {only ? <Link href={adminWorkbookRunPath(run.id)}>Show every page</Link> : <Link href={`${adminWorkbookRunPath(run.id)}?only=attention`}>Show only the {attention.length} pages that need attention</Link>}
          </nav>}
          {shown.map((p) => <DraftPageSection key={p.number} page={p} detail={{ ...draft, images: detail.images }} solves={solves} />)}
        </Fold>
      </>}

      {why && <Fold title="Why this book" hint="The plan's inputs, page choices, warnings and book instructions">{why}</Fold>}
      <Fold title="AI calls and costs" hint={aiCallsHint(detail.aiCalls)}>
        <RecordFacts facts={[
          ["Made on", run.runner === "mac" ? <span key="runner" className="adm-wb-state">{runnerText(run)}<WorkerLine worker={worker} /></span> : runnerText(run)],
          ["AI calls", aiCallsFact(detail.aiCalls)],
          ["Checking AI", <SolveFact key="solve" solves={detail.solves} summary={solveResult} />],
          ...(draft ? [["Writing AI", <span key="model" title={draft.workbook.model}>{plainModel(draft.workbook.model, "Scripted writer")}</span>] as [string, ReactNode]] : []),
        ]} />
      </Fold>
      <Fold title="Audit log" hint={many(detail.audit.length, "entry", "entries")}>
        <AuditLog entries={detail.audit} />
      </Fold>
    </AdminFrame>
  );
}

/** The closed AI section's one line: how many calls, and the API's cost. */
function aiCallsHint(s: AiCallSummary): string {
  const total = s.subscription.calls + s.api.calls;
  if (total === 0) return "No AI calls logged yet";
  return `${many(total, "call", "calls")} · API ${usd(s.api.usd)}${s.api.noCost > 0 || s.incomplete > 0 ? " (some costs unknown)" : ""}`;
}
