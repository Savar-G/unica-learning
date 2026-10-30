// One workbook as data in the admin area (#299): its facts, then each page with its image, the measured question
// boxes drawn over it, and each question's package (answer, worked steps, skill, wrong answers, easier example). A
// server component with no JavaScript.
import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkbookDetail } from "@/lib/admin-store";
import { when } from "@/lib/admin-view";
import { stepText, type AnswerValue, type QuestionPackage } from "@/lib/question-package";
import type { WorkbookPage, WorkbookQuestion, WorkbookStatus } from "@/lib/workbook-content";
import { AdminFrame, Chip, Table, type Tone } from "@/components/admin";
import { RecordFacts, childPath } from "@/components/admin-records";
import "./admin-workbook.css";

const STATUS: Record<WorkbookStatus, [string, Tone]> = {
  draft: ["Draft", "muted"], approved: ["Approved", "info"], printed: ["Printed", "info"], shipped: ["Shipped", "ok"],
};

export const WorkbookStatusChip = ({ status }: { status: WorkbookStatus }) => <Chip tone={STATUS[status][1]}>{STATUS[status][0]}</Chip>;

function value(v: AnswerValue): string {
  switch (v.type) {
    case "number": return String(v.value);
    case "fraction": return `${v.numerator}/${v.denominator}`;
    default: return v.value;
  }
}

const pageTitle = (p: WorkbookPage) => [`Page ${p.number}`, p.dayLabel, p.type].filter(Boolean).join(" · ");

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

function PackageCells({ p }: { p: QuestionPackage }): ReactNode {
  return <>
    <td><span className="adm-wb-text">{p.text}</span><span className="adm-sub adm-mono">{p.id}</span></td>
    <td className="adm-num">{value(p.answer.value)}{p.answer.accepted.length > 0 && <span className="adm-sub">also {p.answer.accepted.map(value).join(", ")}</span>}</td>
    <td><ol className="adm-wb-steps">{p.steps.map((s) => <li key={s.id}>{stepText(s, p.operation)}</li>)}</ol></td>
    <td className="adm-nowrap">{p.skill.standard}<span className="adm-sub adm-mono">{p.skill.skills.join(", ")}</span></td>
    <td className="adm-nowrap">U{p.level} · {p.difficulty}</td>
    <td><ul className="adm-wb-list">{p.wrongAnswers.map((w, i) => (
      <li key={i}><b>{value(w.value)}</b> {w.cause}: {w.description}{w.step && <span className="adm-sub">at the {w.step} step</span>}</li>
    ))}</ul></td>
    <td className="adm-nowrap">{p.easierExample.text.replace("?", value(p.easierExample.answer))}</td>
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
        : <td colSpan={7}><Chip tone="warn">Content unavailable</Chip> <span className="adm-sub">{q.content.detail}</span></td>}
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
              head={["#", "Box (x, y · w × h)", "Question", "Answer", "Worked steps", "Skill", "Level · difficulty", "Wrong answers", "Easier example"]}>
              {p.questions.map((q) => <QuestionRow key={q.number} q={q} />)}
            </Table>
          </div>
        </section>
      ))}
    </AdminFrame>
  );
}
