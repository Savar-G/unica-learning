"use client";

// PROTOTYPE ONLY (branch site/report-prototype, round r12). The report email, as a 600 px single column that an
// email client can render: no scripts, no interaction, one button. It carries the variant's lead so each direction
// can be judged in the inbox too. The real email is built with table markup after a direction is chosen.
import { BRAND, PLANS } from "@/lib/site";
import { BANDS, FSA, STATUS_LABEL, TAKERS, levelSentence, verdictSentence } from "./data";
import { Meter, PROVINCE_NAME, Sample, Scale, helpText, helpTitle, type ReportProps } from "./parts";

export function ReportEmail({ c, stage, prov, helped, variant }: ReportProps & { variant: string }) {
  const work = c.work.find((w) => w.comment) ?? c.work[0];
  const n = TAKERS[stage];
  return (
    <div className="rp-mail-wrap">
      <div className="rp-mail-chrome">
        <p><b>From</b> {BRAND} &lt;reports@unicalearning.com&gt;</p>
        <p><b>Subject</b> {c.name}&apos;s math report is ready</p>
        <p className="pre"><b>Preview</b> {levelSentence(c)} See the four areas and {c.their} work.</p>
      </div>
      <div className={`rp-mail v-${variant}`}>
        <p className="m-logo">{BRAND}</p>
        <p className="m-hi">Hi Priya,</p>
        <p>{c.name} finished the math placement test today: {c.questions} questions in {c.minutes} minutes. <Sample /></p>

        <div className="m-lead">
          {variant === "C" ? <p className="m-big">{c.level === 0 ? "K" : c.level}</p> : null}
          <p className="m-level">{levelSentence(c)}</p>
          <p>{verdictSentence(c)}</p>
          {variant !== "A" && variant !== "D" && <Scale c={c} />}
          {prov === "BC" && FSA[c.grade] && <p className="m-small">For context: in BC&apos;s 2025/26 FSA, {FSA[c.grade]}% of grade {c.grade} students with a result were On Track or Extending in numeracy. The FSA is a different test.</p>}
          {stage === 2 && <p className="m-small">Among {n} grade {c.grade} children who took this test, {c.name} is in the {BANDS[c.band].toLowerCase()}. <Sample /></p>}
          {stage === 3 && <p className="m-small">{c.name} scored higher than {c.percentile}% of {n} grade {c.grade} children who took this test. <Sample /></p>}
        </div>
        {helped && <p className="m-warn"><b>This level may be too high.</b> Some answers came very fast, and you told us someone helped. A retake with new questions will place {c.name} correctly.</p>}

        <table className="m-table">
          <tbody>
            {c.strands.map((s) => (
              <tr key={s.name}>
                <td>{s.name}</td>
                {variant === "A3" && <td className="m-meter"><Meter correct={s.correct} total={s.total} label={STATUS_LABEL[s.status]} /></td>}
                <td className={`m-st is-${s.status}`}>{STATUS_LABEL[s.status]}</td>
                <td className="n">{s.correct}/{s.total}</td>
              </tr>
            ))}
            <tr>
              <td>Number facts</td>
              <td colSpan={variant === "A3" ? 3 : 2} className="n">{c.facts.correct}/{c.facts.tried} right · {c.facts.perMinute} a minute</td>
            </tr>
          </tbody>
        </table>

        <div className="m-work">
          <p className="m-small">From {c.name}&apos;s work: {work.question}</p>
          <div className="rp-board">{work.lines.map((l, i) => <span key={i}>{l}</span>)}</div>
          {work.comment && <p className="m-small">{work.comment}</p>}
        </div>

        <h3>{helpTitle(c)}</h3>
        <p>{helpText(c)}</p>

        {prov === "BC" ? (
          <>
            <p className="m-btn"><a href="#plan" onClick={(e) => e.preventDefault()}>Choose a plan for {c.name}</a></p>
            <p className="m-small m-c">Math CAD {PLANS.one.price}/month or Math + Reading CAD {PLANS.both.price}/month. Nothing is charged until the first workbook ships.</p>
          </>
        ) : (
          <>
            <p className="m-btn"><a href="#waitlist" onClick={(e) => e.preventDefault()}>Join the waitlist</a></p>
            <p className="m-small m-c">Books for the {PROVINCE_NAME[prov]} curriculum are coming. We will email you when they are ready.</p>
          </>
        )}
        <p className="m-c"><a href="#report" onClick={(e) => e.preventDefault()}>See the full report in your account</a></p>
        <p className="m-foot">{BRAND} · Vancouver, BC · You get this email because you signed up for a free placement test. <a href="#unsub" onClick={(e) => e.preventDefault()}>Unsubscribe</a></p>
      </div>
    </div>
  );
}
