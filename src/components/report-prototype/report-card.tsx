"use client";

// PROTOTYPE ONLY (branch site/report-prototype, round r13). Savar chose A (Report card) from r12 and asked for
// full width, more space, and a version with B's ruler and meters. Same content as A; the axis is layout and spacing.
import { BRAND } from "@/lib/site";
import { STATUS_LABEL, levelSentence, verdictSentence, type Child } from "./data";
import {
  Comparison,
  Cta,
  Facts,
  FsaLine,
  HelpWarning,
  HowWeHelp,
  Meta,
  Meter,
  MeterLegend,
  PROVINCE_NAME,
  Scale,
  StatusChip,
  WorkCard,
  type Province,
  type ReportProps,
} from "./parts";

function Head({ c, prov, className = "" }: { c: Child; prov: Province; className?: string }) {
  return (
    <header className={`ac-head ${className}`}>
      <div className="ac-title">
        <p className="a-brand">{BRAND}</p>
        <p className="a-title">Math placement report</p>
      </div>
      <dl>
        <div><dt>Child</dt><dd>{c.name}</dd></div>
        <div><dt>School grade</dt><dd>{c.grade}</dd></div>
        <div><dt>Date</dt><dd>{c.date}</dd></div>
        <div><dt>Curriculum</dt><dd>{PROVINCE_NAME[prov]}</dd></div>
      </dl>
    </header>
  );
}

function AreasTable({ c, meters = false }: { c: Child; meters?: boolean }) {
  return (
    <>
      <table className={`a-table ac-table${meters ? " has-meters" : ""}`}>
        <thead>
          <tr>
            <th scope="col">Area</th>
            {meters && <th scope="col">Share right</th>}
            <th scope="col">Result</th>
            <th scope="col">Questions right</th>
          </tr>
        </thead>
        <tbody>
          {c.strands.map((s) => (
            <tr key={s.name}>
              <th scope="row">{s.name}<span>{s.note}</span></th>
              {meters && <td className="ac-meter"><Meter correct={s.correct} total={s.total} label={STATUS_LABEL[s.status]} /></td>}
              <td><StatusChip s={s.status} /></td>
              <td className="n">{s.correct} of {s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {meters && <MeterLegend />}
      <p className="a-foot">Secure: 80% or more right. Developing: 50-79%. Needs attention: under 50%. {c.questions} questions is an early signal, not a final verdict.</p>
    </>
  );
}

function MeterRows({ c }: { c: Child }) {
  return (
    <div className="ac-meters">
      {c.strands.map((s) => (
        <div className="ac-mrow" key={s.name}>
          <div className="b-meter-h">
            <b>{s.name}</b>
            <StatusChip s={s.status} />
          </div>
          <Meter correct={s.correct} total={s.total} label={STATUS_LABEL[s.status]} />
          <div className="b-meter-f">
            <span className="rp-count">{s.correct} of {s.total} questions</span>
            <span>{s.note}</span>
          </div>
        </div>
      ))}
      <MeterLegend />
      <p className="a-foot">Secure: 80% or more right. Developing: 50-79%. Needs attention: under 50%. {c.questions} questions is an early signal, not a final verdict.</p>
    </div>
  );
}

function Work({ c }: { c: Child }) {
  return (
    <div className="ac-work">
      {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
    </div>
  );
}

/** One report-card row: a label column on the left, the content on the right. */
function Row({ title, lead, children, id }: { title: string; lead?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="ac-row" id={id}>
      <div className="ac-row-l">
        <h2>{title}</h2>
        {lead && <p>{lead}</p>}
      </div>
      <div className="ac-row-r">{children}</div>
    </section>
  );
}

/* A2. Wide document: the report card across the full page, each section a row with its label on the left. */
export function VariantA2({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="ac ac-wide">
      <Head c={c} prov={prov} />
      <section className="ac-overall">
        <p className="rp-k">Overall</p>
        <h1>{levelSentence(c)}</h1>
        <p className="a-sub">{verdictSentence(c)}</p>
        <Scale c={c} />
        <div className="ac-context">
          <FsaLine c={c} />
          <Comparison c={c} stage={stage} />
        </div>
        {helped && <HelpWarning c={c} />}
      </section>
      <Row title="By area" lead={`Four areas of math. Each shows how many questions ${c.name} got right.`}>
        <AreasTable c={c} />
      </Row>
      <Row title="Number facts" lead="A short timed round, only with facts for this grade.">
        <Facts c={c} />
      </Row>
      <Row title={`${c.name}'s work`} lead="Shown on the whiteboard during the test, exactly as written.">
        <Work c={c} />
      </Row>
      <Row title="How we help">
        <HowWeHelp c={c} eyebrow={false} />
      </Row>
      <Row title="Next step">
        <Cta c={c} prov={prov} />
      </Row>
      <footer className="ac-foot"><Meta c={c} prov={prov} /></footer>
    </article>
  );
}

/* A3. Report card + ruler: A2's rows, B's big ruler in a colour band, and a meter in every area row. */
export function VariantA3({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="ac ac-ruler">
      <Head c={c} prov={prov} />
      <section className={`ac-band is-${c.verdict}`}>
        <p className="rp-k">Overall</p>
        <h1>{levelSentence(c)}</h1>
        <p className="a-sub">{verdictSentence(c)}</p>
        <Scale c={c} />
      </section>
      {(stage > 1 || helped || c.grade === 4 || c.grade === 7) && (
        <div className="ac-context ac-context-pad">
          <FsaLine c={c} />
          <Comparison c={c} stage={stage} />
          {helped && <HelpWarning c={c} />}
        </div>
      )}
      <Row title="By area" lead="The marker shows the share right. The zones show where Secure, Developing and Needs attention start.">
        <AreasTable c={c} meters />
      </Row>
      <Row title="Number facts" lead="A short timed round, only with facts for this grade.">
        <Facts c={c} />
      </Row>
      <Row title={`${c.name}'s work`} lead="Shown on the whiteboard during the test, exactly as written.">
        <Work c={c} />
      </Row>
      <Row title="How we help">
        <HowWeHelp c={c} eyebrow={false} />
      </Row>
      <Row title="Next step">
        <Cta c={c} prov={prov} tone="field" />
      </Row>
      <footer className="ac-foot"><Meta c={c} prov={prov} /></footer>
    </article>
  );
}

/* A4. Panels: the same report card order, each section in its own roomy panel. */
export function VariantA4({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="ac ac-panels">
      <Head c={c} prov={prov} className="ac-panel is-white" />
      <section className="ac-panel is-white ac-overall">
        <p className="rp-k">Overall</p>
        <h1>{levelSentence(c)}</h1>
        <p className="a-sub">{verdictSentence(c)}</p>
        <Scale c={c} />
        <div className="ac-context">
          <FsaLine c={c} />
          <Comparison c={c} stage={stage} />
        </div>
        {helped && <HelpWarning c={c} />}
      </section>
      <section className="ac-panel">
        <h2>By area</h2>
        <AreasTable c={c} />
      </section>
      <section className="ac-panel">
        <h2>Number facts</h2>
        <Facts c={c} />
      </section>
      <section className="ac-panel">
        <h2>{c.name}&apos;s work</h2>
        <Work c={c} />
      </section>
      <div className="ac-pair">
        <section className="ac-panel"><HowWeHelp c={c} /></section>
        <section className="ac-panel is-field"><Cta c={c} prov={prov} tone="field" /></section>
      </div>
      <footer className="ac-foot"><Meta c={c} prov={prov} /></footer>
    </article>
  );
}

/* A5. Summary beside detail: the level, ruler and next step stay in view on the left; the detail scrolls on the right. */
export function VariantA5({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="ac ac-split">
      <Head c={c} prov={prov} />
      <div className="ac-split-in">
        <aside className="ac-side">
          <div className="ac-side-in">
            <p className="rp-k">Overall</p>
            <p className={`ac-side-level is-${c.verdict}`}>{c.level === 0 ? "K" : c.level}</p>
            <h1>{levelSentence(c)}</h1>
            <p className="a-sub">{verdictSentence(c)}</p>
            <Scale c={c} />
            <Comparison c={c} stage={stage} />
            <div className="ac-side-cta">
              <Cta c={c} prov={prov} tone="field" />
            </div>
          </div>
        </aside>
        <div className="ac-main">
          <FsaLine c={c} />
          {helped && <HelpWarning c={c} />}
          <section className="ac-sec">
            <h2>By area</h2>
            <MeterRows c={c} />
          </section>
          <section className="ac-sec">
            <h2>Number facts</h2>
            <Facts c={c} />
          </section>
          <section className="ac-sec">
            <h2>{c.name}&apos;s work</h2>
            <div className="ac-work is-two">
              {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
            </div>
          </section>
          <section className="ac-sec">
            <HowWeHelp c={c} />
          </section>
          <footer className="ac-foot"><Meta c={c} prov={prov} /></footer>
        </div>
      </div>
    </article>
  );
}
