import Link from "next/link";
import { SupportPage } from "@/components/support-page";
import type { ParentWorkbookAnswers } from "@/lib/parent-workbook-answers";
import { workbooksPath } from "@/lib/parent-shell";
import "./parent-workbooks.css";

export function ParentWorkbookAnswerKey({ answerKey }: { answerKey: ParentWorkbookAnswers }) {
  return <SupportPage label="Workbooks" title={`Workbook ${answerKey.number} answers`}>
    <p><Link href={workbooksPath(answerKey.childId)}>← Back to {answerKey.childName}&apos;s workbooks</Link></p>
    {answerKey.pages.length === 0 ? <p>No answers are available for this workbook.</p> : <>
      <p className="pw-sub">Use the page and question numbers to find an answer. Some questions have more than one correct answer.</p>
      {answerKey.pages.map(page => <section key={page.number} className="pw-card pw-section" aria-labelledby={`pw-answers-${page.number}`}>
        <h2 id={`pw-answers-${page.number}`}>{page.dayLabel ? `${page.dayLabel} · ` : ""}Page {page.number}</h2>
        <ol className="pw-answers">
          {page.questions.map(question => <li key={question.number} value={question.number}>
            <h3>Question {question.number}</h3>
            {question.kind === "unavailable" ? <p>The answer is not available for this question.</p>
              : question.kind === "open" ? <p>There is no single fixed answer.</p> : <>
                {question.kind === "example" && <p className="pw-sub">Example answers</p>}
                <ul className="pw-answer-parts">{question.answers.map((answer, i) => <li key={i}>
                  {(question.answers.length > 1 || answer.part > 1) && <span className="pw-answer-label">Part {answer.part}: </span>}<b>{answer.value}</b>
                  {answer.alternatives.length > 0 && <span className="pw-sub"> Also accepted: {answer.alternatives.join("; ")}</span>}
                </li>)}</ul>
                {question.hasOpenWork && <p className="pw-sub">Other parts of this question can have different answers.</p>}
              </>}
          </li>)}
        </ol>
      </section>)}
    </>}
  </SupportPage>;
}
