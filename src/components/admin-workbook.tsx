// One workbook as data in the admin area (#299): its facts, then each page with its image, the measured question
// boxes drawn over it, and each question's package (its item's format and answer keys, whether code checked it,
// worked steps, skill, wrong answers, easier example). A server component with no JavaScript.
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkbookDetail } from "@/lib/admin-store";
import { when } from "@/lib/admin-view";
import { checkQuestionPackage, hasOperation, packageItem, stepText, valueText, type AnswerRegion, type QuestionPackage } from "@/lib/question-package";
import type { WorkbookPage, WorkbookQuestion, WorkbookStatus } from "@/lib/workbook-content";
import { AdminFrame, Chip, Table, type Tone } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";
import "./admin-workbook.css";

const STATUS: Record<WorkbookStatus, [string, Tone]> = {
  draft: ["Draft", "muted"], approved: ["Approved", "info"], printed: ["Printed", "info"], shipped: ["Shipped", "ok"],
};

export const WorkbookStatusChip = ({ status }: { status: WorkbookStatus }) => <Chip tone={STATUS[status][1]}>{STATUS[status][0]}</Chip>;

export const pageTitle = (p: Pick<WorkbookPage, "number" | "dayLabel" | "type">) => [`Page ${p.number}`, p.dayLabel, p.type].filter(Boolean).join(" · ");

/** The page image with each question's box over it, numbered as on the page. */
function PageImage({ page, url }: { page: WorkbookPage; url: string | undefined }) {
  if (!page.image) return <p className="adm-empty">This page has no image.</p>;
  const { width, height } = page.image;
  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  return (
    <figure className="adm-wb-page" style={{ aspectRatio: `${width} / ${height}` }}>
      {/* A private, short-lived URL: not for the image optimizer, which would cache it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={`${pageTitle(page)}, as printed`} /> : <figcaption className="adm-empty">The page image did not load.</figcaption>}
      {page.questions.map((q) => (
        <span key={q.number} className="adm-wb-box" aria-hidden="true"
          style={{ left: pct(q.box.x, width), top: pct(q.box.y, height), width: pct(q.box.width, width), height: pct(q.box.height, height) }}>
          {q.number}
        </span>
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

/** The answer key: each region of the item, or for a package with no item, its answer and accepted forms. */
function AnswerCell({ p }: { p: QuestionPackage }): ReactNode {
  const accepted = p.answer && p.answer.accepted.length > 0 && <span className="adm-sub">also {p.answer.accepted.map(valueText).join(", ")}</span>;
  if (!p.item) return <>{p.answer && valueText(p.answer.value)}{accepted}</>;
  return <>
    <ul className="adm-wb-list">{p.item.regions.map((r) => (
      <li key={r.id}><span className="adm-mono">{r.label ?? r.id}</span> {regionKey(r)}</li>
    ))}</ul>
    {accepted}
  </>;
}

/** A package's cells in the question tables; `check` replaces the code check cell (a draft shows the generator's verdict). */
export function PackageCells({ p, check }: { p: QuestionPackage; check?: ReactNode }): ReactNode {
  const item = packageItem(p);
  const marking = item.scorable ? "scorable" : item.parentChecked ? "a parent checks it" : "not scored";
  return <>
    <td><span className="adm-wb-text">{p.text}</span><span className="adm-sub adm-mono">{p.id}</span><span className="adm-sub">{item.format} · {marking}</span></td>
    <td><AnswerCell p={p} /></td>
    <td>{check ?? <CheckCell p={p} />}</td>
    <td><ol className="adm-wb-steps">{hasOperation(p) && p.steps.map((s) => <li key={s.id}>{stepText(s, p.operation)}</li>)}</ol></td>
    <td className="adm-nowrap">{p.skill.standard}<span className="adm-sub adm-mono">{p.skill.skills.join(", ")}</span></td>
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

export function AdminWorkbook({ email, detail }: { email: string; detail: WorkbookDetail }) {
  const { workbook: w, child, images } = detail;
  const questions = w.pages.flatMap((p) => p.questions);
  return (
    <AdminFrame email={email} section="children" title={`${child?.first_name ?? "Child"}: workbook ${w.number}`}>
      <RecordFacts facts={[
        ["Child", <Link key="child" href={childPath(w.childId)}>{child?.first_name ?? w.childId}</Link>],
        ["Status", <WorkbookStatusChip key="status" status={w.status} />],
        ["Levels", w.levels.map((l) => `U${l}`).join(", ")],
        ["Pages and questions", `${w.pages.length} pages · ${questions.length} questions`],
        ["Made (Pacific)", when(w.createdAt)],
        ["PDF", w.pdfPath ?? "None yet"],
        ["Profile build", w.profileBuild ?? "None"],
        ["Workbook id", <span key="id" className="adm-mono">{w.id}</span>],
      ]} />
      {w.pages.map((p) => (
        <section key={p.number} className="adm-wb-section" aria-labelledby={`page-${p.number}`}>
          <h2 id={`page-${p.number}`}>{pageTitle(p)}</h2>
          <p className="adm-note adm-mono">QR token {p.qrToken}{p.image && ` · ${p.image.width} × ${p.image.height} px · ${p.image.path}`}</p>
          <div className="adm-wb-grid">
            <PageImage page={p} url={p.image ? images[p.image.path] : undefined} />
            <Table label={`Questions on page ${p.number}`} empty="No questions on this page."
              head={["#", "Box (x, y · w × h)", "Question", "Answer", "Check", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
              {p.questions.map((q) => <QuestionRow key={q.number} q={q} />)}
            </Table>
          </div>
        </section>
      ))}
    </AdminFrame>
  );
}
