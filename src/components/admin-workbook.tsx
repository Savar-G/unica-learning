// One workbook as data in the admin area (#299): D-315: a header with the child, the book number and this book's place
// on Production's stage track; the print and ship steps (the anchors #print-and-ship and #workbook-delivery, which
// Production links to); the pages as thumbnails with the measured question boxes drawn over them; each page's
// question packages (format and answer keys, whether code checked it, worked steps, skill, wrong answers, easier
// example) in a closed section; the audit log closed. A server component; the action buttons are client parts.
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkbookDetail } from "@/lib/admin-store";
import { ADMIN_PATH, adminWorkbookRunPath, when, workbookPdfPath } from "@/lib/admin-view";
import { checkQuestionPackage, hasOperation, packageItem, stepText, valueText, type AnswerRegion, type QuestionPackage } from "@/lib/question-package";
import type { WorkbookPage, WorkbookQuestion, WorkbookStatus } from "@/lib/workbook-content";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { Chip, Table, type Tone } from "@/components/admin";
import { AdminFrame } from "@/components/admin-frame";
import { RecordFacts, childPath } from "@/components/admin-records";
import { AuditLog } from "@/components/admin-workbook-audit";
import { MarkWorkbook } from "@/components/workbook-ship-actions";
import { WorkbookDelivery } from "@/components/workbook-delivery";
import { Fold } from "@/components/admin-fold";
import { STAGE_TEXT, type Stage } from "@/lib/admin-production";
import { printSteps, stageTrack, workbookStage, type PrintStep, type StepState } from "@/lib/admin-book";
import "./admin-workbook.css";
import "./admin-book.css";

const STATUS: Record<WorkbookStatus, [string, Tone]> = {
  draft: ["Draft", "muted"], approved: ["Approved", "info"], printed: ["Printed", "info"], shipped: ["Shipped", "ok"],
};

export const WorkbookStatusChip = ({ status }: { status: WorkbookStatus }) => <Chip tone={STATUS[status][1]}>{STATUS[status][0]}</Chip>;

export const pageTitle = (p: Pick<WorkbookPage, "number" | "dayLabel" | "type">) => [`Page ${p.number}`, p.dayLabel, p.type].filter(Boolean).join(" · ");

/** The page image with each question's box over it, numbered as on the page. */
function PageImage({ page, url, workbookId, printed }: { page: WorkbookPage; url: string | undefined; workbookId: string; printed: boolean }) {
  if (!page.image) return <p className="adm-empty">This page has no image.</p>;
  const { width, height } = page.image;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <figure className="adm-wb-page" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={`${pageTitle(page)}, as printed`} /> : <figcaption className="adm-empty">The page image did not load.</figcaption>}
      {page.questions.map((q) => (
        <Link key={q.number} className="adm-wb-box" aria-label={`Choose page ${page.number}, number ${q.number} for Maya`}
          href={`${ADMIN_PATH}/maya?workbook=${workbookId}&page=${page.number}&question=${q.number}`}
          aria-disabled={!printed || undefined} tabIndex={printed ? 0 : -1}
          style={{ left: pct(q.box.x, width), top: pct(q.box.y, height), width: pct(q.box.width, width), height: pct(q.box.height, height) }}>
          {q.number}
        </Link>
      ))}
    </figure>
  );
}

/** What code says about a found question: checked, or not checked by code and why (#362). */
function CheckCell({ p }: { p: QuestionPackage }): ReactNode {
  const check = checkQuestionPackage(p);
  if (check.ok) return <Chip tone="ok">Checked by code</Chip>;
  return <>
    <Chip tone={check.status === "failed" ? "bad" : "warn"}>{check.status === "failed" ? "Failed" : "Not checked by code"}</Chip>
    <span className="adm-sub">{check.reason}</span>
  </>;
}

/** A region's answer key; work boxes, writing lines and pictures are never scored. */
function regionKey(r: AnswerRegion): string {
  if (r.kind === "box") return r.answer ? valueText(r.answer) : "no key";
  if (r.kind === "choice") return `${r.answer ?? "no key"} (${r.mark} one of ${r.choices.join(", ")})`;
  return "not scored";
}

/** A region's plain name: its printed label, else what it is; never an internal id. */
function regionName(r: AnswerRegion): string {
  if (r.label) return r.label;
  if (r.kind === "box") return "Answer box";
  if (r.kind === "choice") return "Choice";
  return r.kind === "picture" ? "Drawing space" : "Writing space";
}

const BC = curriculumFor("bc");

/** A package's skills by their plain names from the BC skill map ("Recall addition facts to 20"), else the standard's
 * text; the codes go in the tooltip only. */
function SkillCell({ skill }: { skill: QuestionPackage["skill"] }): ReactNode {
  const names = skill.skills.map((id) => BC?.skill(id)?.text).filter((t): t is string => !!t);
  const unit = BC?.unit(skill.standard)?.text;
  const name = names.length ? names.join("; ") : unit ? unit[0].toUpperCase() + unit.slice(1) : "Skill not in the skill map";
  return <span title={[skill.standard, ...skill.skills].join(" · ")}>{name}</span>;
}

const formatText = (f: string) => f.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** The answer key: each region of the item, or for a package with no item, its answer and accepted forms. */
function AnswerCell({ p }: { p: QuestionPackage }): ReactNode {
  const accepted = p.answer && p.answer.accepted.length > 0 && <span className="adm-sub">also {p.answer.accepted.map(valueText).join(", ")}</span>;
  if (!p.item) return <>{p.answer && valueText(p.answer.value)}{accepted}</>;
  return <>
    <ul className="adm-wb-list">{p.item.regions.map((r) => (
      <li key={r.id} title={`Region ${r.id}`}>{regionName(r)}{/[?:]$/.test(regionName(r)) ? "" : ":"} {regionKey(r)}</li>
    ))}</ul>
    {accepted}
  </>;
}

/** A package's cells in the question tables; `check` replaces the code check cell (a draft shows the generator's verdict). */
export function PackageCells({ p, check }: { p: QuestionPackage; check?: ReactNode }): ReactNode {
  const item = packageItem(p);
  const marking = item.scorable ? "scorable" : item.parentChecked ? "a parent checks it" : "not scored";
  return <>
    <td title={`Question id ${p.id}`}><span className="adm-wb-text">{p.text}</span><span className="adm-sub">{formatText(item.format)} · {marking}</span></td>
    <td><AnswerCell p={p} /></td>
    <td>{check ?? <CheckCell p={p} />}</td>
    <td><ol className="adm-wb-steps">{hasOperation(p) && p.steps.map((s) => <li key={s.id}>{stepText(s, p.operation)}</li>)}</ol></td>
    <td className="adm-wb-skill"><SkillCell skill={p.skill} /></td>
    <td className="adm-nowrap">U{p.level} · {p.difficulty}</td>
    <td><ul className="adm-wb-list">{p.wrongAnswers.map((w, i) => (
      <li key={i}><b>{valueText(w.value)}</b> {w.cause}: {w.description}{w.step && <span className="adm-sub">at the {w.step} step</span>}</li>
    ))}</ul></td>
    <td className="adm-nowrap">{p.easierExample ? p.easierExample.text.replace("?", valueText(p.easierExample.answer)) : "None"}</td>
  </>;
}

function QuestionRow({ q }: { q: WorkbookQuestion }) {
  const box = `${q.box.x}, ${q.box.y} · ${q.box.width} × ${q.box.height}`;
  return (
    <tr>
      <td className="adm-num">{q.number}</td>
      <td className="adm-mono adm-nowrap">{box}</td>
      {q.content.status === "found"
        ? <PackageCells p={q.content.package} />
        : <td colSpan={8}><Chip tone="warn">Content unavailable</Chip> <span className="adm-sub">{q.content.detail}</span></td>}
    </tr>
  );
}

/** "1 Nov 2026, 10:04 by savar@..." from the status's time and its audit entry; "Not yet" before it. */
function doneText(at: string | null, action: string, audit: WorkbookDetail["audit"]): string {
  if (!at) return "Not yet";
  const by = [...audit].reverse().find((e) => e.action === action)?.actor_email;
  return `${when(at)}${by ? ` by ${by}` : ""}`;
}

const ICON_OK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
const STEP_WORD: Record<StepState, string> = { done: "Done", now: "To do now", later: "Later" };

/** This book's place on Production's stage track: the stages before it done, its own marked. */
export function BookStageTrack({ stage }: { stage: Stage }) {
  const track = stageTrack(stage);
  return <ol className="bk-track" aria-label={`Stage: ${STAGE_TEXT[stage]}`}>
    {track.map((s, i) => <li key={s.stage} className={`is-${s.state}`} aria-current={s.stage === stage ? "step" : undefined}>
      <span className="bk-node" aria-hidden="true">{s.state === "done" ? ICON_OK : i + 1}</span>
      <span className="bk-track-text">{STAGE_TEXT[s.stage]}<span className="adm-sr"> ({STEP_WORD[s.state]})</span></span>
    </li>)}
  </ol>;
}

/** One print and ship step: its number or a check mark, its title and state, and its action. */
function Step({ state, n, title, children }: { state: StepState; n: number; title: ReactNode; children?: ReactNode }) {
  return <li className={`bk-step is-${state}`} aria-current={state === "now" ? "step" : undefined}>
    <span className="bk-node" aria-hidden="true">{state === "done" ? ICON_OK : n}</span>
    <div className="bk-step-body">
      {title !== null && <div className="bk-step-head"><h3>{title}</h3><span className={`bk-step-state is-${state}`}>{STEP_WORD[state]}</span></div>}
      {children}
    </div>
  </li>;
}

/**
 * #314: print and ship, as steps. Approve (on the draft's page), then download the PDF for the print partner and "Mark
 * printed" (approved), then "Mark shipped" (printed), then confirm the delivery (shipped). The child's first shipped
 * workbook leads to "Workbook shipped: start plan" (D-140); no plan starts here.
 */
function PrintAndShip({ detail }: { detail: WorkbookDetail }) {
  const { workbook: w, audit } = detail;
  const steps = printSteps(w.status, !!detail.delivery);
  const state = (k: PrintStep) => steps.find((s) => s.step === k)!.state;
  return <section className="bk-ship" aria-labelledby="print-and-ship">
    <h2 id="print-and-ship">Print and ship</h2>
    <ol className="bk-steps">
      <Step state={state("approve")} n={1} title="Approve the draft">
        <p className="adm-note">{w.status === "draft"
          ? <>This workbook is not approved. Approve its draft first.{detail.runId && <> <Link href={adminWorkbookRunPath(detail.runId)}>Open the draft</Link></>}</>
          : `Approved: ${doneText(w.approvedAt, "workbook-approved", audit)}.`}</p>
      </Step>
      <Step state={state("print")} n={2} title="Print">
        <div className="adm-row">
          {w.pdfPath && <a className={`btn adm-btn${state("print") === "now" ? "" : " ghost"}`} href={`${workbookPdfPath(w.id)}?download=1`}>Download PDF for print</a>}
          {w.status === "approved" && <MarkWorkbook workbookId={w.id} to="printed" number={w.number} />}
        </div>
        {!w.pdfPath && <p className="adm-note">No PDF yet.</p>}
        {w.printedAt && <p className="adm-note">Printed: {doneText(w.printedAt, "workbook-printed", audit)}. A printed workbook cannot change.</p>}
      </Step>
      <Step state={state("ship")} n={3} title="Ship">
        {w.status === "printed" ? <div className="adm-row"><MarkWorkbook workbookId={w.id} to="shipped" number={w.number} /></div>
          : <p className="adm-note">{w.shippedAt ? `Shipped: ${doneText(w.shippedAt, "workbook-shipped", audit)}.` : "Mark it shipped after it is printed."}</p>}
      </Step>
      {w.status === "shipped"
        ? <Step state={state("deliver")} n={4} title={null}>
          <WorkbookDelivery workbookId={w.id} childId={w.childId} number={w.number} heading="h3"
            timeZone={detail.deliveryZone} receipt={detail.delivery} actor={audit.find((e) => e.id === (detail.delivery?.correction?.auditId ?? detail.delivery?.auditId))?.actor_email} />
        </Step>
        : <Step state="later" n={4} title="Workbook delivery"><p className="adm-note">Confirm when the workbook arrives at the family&apos;s home, after it is shipped.</p></Step>}
    </ol>
    <p className="adm-sub">Times are Pacific.</p>
  </section>;
}

/** A page as a thumbnail: its image with the question boxes, its title and its question count. */
function PageThumb({ page, url, workbookId, printed }: { page: WorkbookPage; url: string | undefined; workbookId: string; printed: boolean }) {
  return <li className="bk-thumb">
    <PageImage page={page} url={url} workbookId={workbookId} printed={printed} />
    <a className="bk-thumb-cap" href={`#page-${page.number}`}>
      <b>Page {page.number}</b>
      <span>{[page.dayLabel, page.type].filter(Boolean).join(" · ") || "Page"}</span>
      <span className="adm-sub">{page.questions.length ? `${page.questions.length} ${page.questions.length === 1 ? "question" : "questions"}` : "No questions"}</span>
    </a>
  </li>;
}

export function AdminWorkbook({ email, detail, why, emails }: { email: string; detail: WorkbookDetail; why?: ReactNode; emails?: ReactNode }) {
  const { workbook: w, child, images, audit } = detail;
  const questions = w.pages.flatMap((p) => p.questions);
  const printed = w.status === "printed" || w.status === "shipped";
  const name = child?.first_name ?? "Child";
  const stage = workbookStage(w.status, !!detail.delivery);
  return (
    <AdminFrame email={email} title={`${name}: workbook ${w.number}`} lead="Print it, ship it and confirm it reached the family."
      actions={<>
        {w.pdfPath && <a className="btn adm-btn ghost" href={workbookPdfPath(w.id)} target="_blank" rel="noopener">Open workbook PDF</a>}
        {detail.runId && <Link className="btn adm-btn ghost" href={adminWorkbookRunPath(detail.runId)}>Open the draft&apos;s checks</Link>}
      </>}>
      <section className="bk-head" aria-label={`${name}, workbook ${w.number}`}>
        <div className="bk-head-top">
          <span className="bk-who"><b><Link href={childPath(w.childId)}>{child?.first_name ?? w.childId}</Link> · Book {w.number}</b>
            <span>{w.levels.map((l) => `U${l}`).join(", ")} · {w.pages.length} pages · {questions.length} questions · made {when(w.createdAt)} (Pacific)</span></span>
          <WorkbookStatusChip status={w.status} />
        </div>
        <BookStageTrack stage={stage} />
      </section>
      <PrintAndShip detail={detail} />
      {emails}
      <p className="adm-note"><Link href={`${ADMIN_PATH}/maya?workbook=${w.id}`}>Try Maya on a workbook question</Link>. Only printed workbooks from test families can start a session.</p>
      <section className="bk-pages" aria-labelledby="bk-pages-h">
        <div className="bk-section-head"><h2 id="bk-pages-h">Pages</h2><span className="bk-count">{w.pages.length}</span>
          <p>{printed ? "A number on a page opens that question in Maya." : "The boxes show where each question is measured."}</p></div>
        {w.pages.length ? <ul className="bk-thumbs">{w.pages.map((p) => <PageThumb key={p.number} page={p} url={p.image ? images[p.image.path] : undefined} workbookId={w.id} printed={printed} />)}</ul>
          : <p className="adm-empty">This workbook has no pages.</p>}
        <h3 className="bk-mini">Questions on each page</h3>
        {w.pages.map((p) => (
          <Fold key={p.number} id={`page-${p.number}`} title={pageTitle(p)} hint={`${p.questions.length} ${p.questions.length === 1 ? "question" : "questions"}`}>
            <p className="adm-note adm-mono" title={p.image?.path}>QR token {p.qrToken}{p.image && ` · ${p.image.width} × ${p.image.height} px`}</p>
            <Table label={`Questions on page ${p.number}`} empty="No questions on this page."
              head={["#", "Box (x, y · w × h)", "Question", "Answer", "Check", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
              {p.questions.map((q) => <QuestionRow key={q.number} q={q} />)}
            </Table>
          </Fold>
        ))}
      </section>
      {why && <Fold title="Why this book" hint="The plan's inputs, page choices, warnings and book instructions">{why}</Fold>}
      <Fold title="Audit log" hint={`${audit.length} ${audit.length === 1 ? "entry" : "entries"}: approval, printing, shipping and delivery, with who and when`}>
        <AuditLog entries={audit} />
      </Fold>
      <details className="adm-tech">
        <summary>Technical details</summary>
        <RecordFacts facts={[["Workbook id", <span key="id" className="adm-mono">{w.id}</span>], ["Profile build", <span key="build" className="adm-mono">{w.profileBuild ?? "None"}</span>]]} />
      </details>
    </AdminFrame>
  );
}
