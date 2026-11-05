// One workbook as data in the admin area (#299): its facts, then each page with its image, the measured question
// boxes drawn over it, and each question's package (its item's format and answer keys, whether code checked it,
// worked steps, skill, wrong answers, easier example). A server component with no JavaScript.
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkbookDetail } from "@/lib/admin-store";
import { ADMIN_PATH, adminWorkbookRunPath, when, workbookPdfPath } from "@/lib/admin-view";
import { checkQuestionPackage, hasOperation, packageItem, stepText, valueText, type AnswerRegion, type QuestionPackage } from "@/lib/question-package";
import type { WorkbookPage, WorkbookQuestion, WorkbookStatus } from "@/lib/workbook-content";
import { curriculumFor } from "@/lib/workbook-curriculum";
import { AdminFrame, Chip, Table, type Tone } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";
import { AuditLog } from "@/components/admin-workbook-audit";
import { MarkWorkbook } from "@/components/workbook-ship-actions";
import { WorkbookDelivery } from "@/components/workbook-delivery";
import "./admin-workbook.css";

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

/**
 * #314: print and ship. Download the PDF for the print partner, then "Mark printed" (approved), then "Mark shipped"
 * (printed). The child's first shipped workbook leads to "Workbook shipped: start plan" (D-140); no plan starts here.
 */
function PrintAndShip({ detail }: { detail: WorkbookDetail }) {
  const { workbook: w } = detail;
  return <section className="adm-wb-section" aria-labelledby="print-and-ship">
    <h2 id="print-and-ship">Print and ship</h2>
    <div className="adm-row">
      {w.pdfPath && <a className="btn adm-btn" href={`${workbookPdfPath(w.id)}?download=1`}>Download PDF for print</a>}
      {w.status === "approved" && <MarkWorkbook workbookId={w.id} to="printed" number={w.number} />}
      {w.status === "printed" && <MarkWorkbook workbookId={w.id} to="shipped" number={w.number} />}
    </div>
    {w.status === "draft" && <p className="adm-note">This workbook is not approved. Approve its draft first.</p>}
    {(w.status === "printed" || w.status === "shipped") && <p className="adm-note">A printed workbook cannot change.</p>}
  </section>;
}

export function AdminWorkbook({ email, detail, why }: { email: string; detail: WorkbookDetail; why?: ReactNode }) {
  const { workbook: w, child, images, audit } = detail;
  const questions = w.pages.flatMap((p) => p.questions);
  return (
    <AdminFrame email={email} section="workbooks" title={`${child?.first_name ?? "Child"}: workbook ${w.number}`}>
      <RecordFacts facts={[
        ["Child", <Link key="child" href={childPath(w.childId)}>{child?.first_name ?? w.childId}</Link>],
        ["Status", <WorkbookStatusChip key="status" status={w.status} />],
        ["Levels", w.levels.map((l) => `U${l}`).join(", ")],
        ["Pages and questions", `${w.pages.length} pages · ${questions.length} questions`],
        ["Approved (Pacific)", doneText(w.approvedAt, "workbook-approved", audit)],
        ["Printed (Pacific)", doneText(w.printedAt, "workbook-printed", audit)],
        ["Shipped (Pacific)", doneText(w.shippedAt, "workbook-shipped", audit)],
        ["Made (Pacific)", when(w.createdAt)],
        ["PDF", w.pdfPath ? <a key="pdf" href={workbookPdfPath(w.id)} target="_blank" rel="noopener">Open workbook PDF</a> : "No PDF yet"],
        ...(detail.runId ? [["Draft review", <Link key="run" href={adminWorkbookRunPath(detail.runId)}>Open the draft&apos;s checks</Link>] as [string, ReactNode]] : []),
        ["Profile build", w.profileBuild ?? "None"],
        ["Workbook id", <span key="id" className="adm-mono">{w.id}</span>],
      ]} />
      <PrintAndShip detail={detail} />
      {why}
      <p className="adm-note"><Link href={`${ADMIN_PATH}/maya?workbook=${w.id}`}>Try Maya on a workbook question</Link>. Only printed workbooks from test families can start a session.</p>
      {w.status === "shipped" && <WorkbookDelivery workbookId={w.id} childId={w.childId} number={w.number}
        timeZone={detail.deliveryZone} receipt={detail.delivery} actor={audit.find((e) => e.id === (detail.delivery?.correction?.auditId ?? detail.delivery?.auditId))?.actor_email} />}
      {w.pages.map((p) => (
        <section key={p.number} className="adm-wb-section" aria-labelledby={`page-${p.number}`}>
          <h2 id={`page-${p.number}`}>{pageTitle(p)}</h2>
          <p className="adm-note adm-mono">QR token {p.qrToken}{p.image && ` · ${p.image.width} × ${p.image.height} px · ${p.image.path}`}</p>
          <div className="adm-wb-grid">
            <PageImage page={p} url={p.image ? images[p.image.path] : undefined} workbookId={w.id} printed={w.status === "printed" || w.status === "shipped"} />
            <Table label={`Questions on page ${p.number}`} empty="No questions on this page."
              head={["#", "Box (x, y · w × h)", "Question", "Answer", "Check", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
              {p.questions.map((q) => <QuestionRow key={q.number} q={q} />)}
            </Table>
          </div>
        </section>
      ))}
      <h2>Audit log</h2>
      <AuditLog entries={audit} />
    </AdminFrame>
  );
}
