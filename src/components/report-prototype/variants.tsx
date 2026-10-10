"use client";

// PROTOTYPE ONLY (branch site/report-prototype, round r12). Five report layouts. Same content and data in each;
// the primary axis is the report's structure: what leads and how the parts are grouped.
import { BRAND } from "@/lib/site";
import { STATUS_LABEL, VERDICT_SHORT, gradeName, levelSentence, pct, verdictSentence, type Status } from "./data";
import {
  Comparison,
  Count,
  Cta,
  Dots,
  Facts,
  FsaLine,
  HelpWarning,
  HowWeHelp,
  Meta,
  PROVINCE_NAME,
  Scale,
  StatusChip,
  WorkCard,
  WorkImage,
  helpText,
  helpTitle,
  type ReportProps,
} from "./parts";
import { VariantA2, VariantA3, VariantA4, VariantA5 } from "./report-card";

/* A. Report card: a printable school-style document, read top to bottom. */
export function VariantA({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="rp-a">
      <header className="a-head">
        <p className="a-brand">{BRAND}</p>
        <p className="a-title">Math placement report</p>
        <dl>
          <div><dt>Child</dt><dd>{c.name}</dd></div>
          <div><dt>School grade</dt><dd>{c.grade}</dd></div>
          <div><dt>Date</dt><dd>{c.date}</dd></div>
          <div><dt>Curriculum</dt><dd>{PROVINCE_NAME[prov]}</dd></div>
        </dl>
      </header>

      <section className="a-sec a-level">
        <p className="rp-k">Overall</p>
        <h1>{levelSentence(c)}</h1>
        <p className="a-sub">{verdictSentence(c)}</p>
        <Scale c={c} />
        <FsaLine c={c} />
        <Comparison c={c} stage={stage} />
        {helped && <HelpWarning c={c} />}
      </section>

      <section className="a-sec">
        <h2>By area</h2>
        <table className="a-table">
          <thead>
            <tr><th scope="col">Area</th><th scope="col">Result</th><th scope="col">Questions right</th></tr>
          </thead>
          <tbody>
            {c.strands.map((s) => (
              <tr key={s.name}>
                <th scope="row">{s.name}<span>{s.note}</span></th>
                <td><StatusChip s={s.status} /></td>
                <td className="n">{s.correct} of {s.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="a-foot">Secure: 80% or more right. Developing: 50-79%. Needs attention: under 50%. {c.questions} questions is an early signal, not a final verdict.</p>
      </section>

      <section className="a-sec">
        <h2>Number facts</h2>
        <Facts c={c} />
      </section>

      <section className="a-sec">
        <h2>{c.name}&apos;s work</h2>
        <div className="a-work">
          {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
        </div>
      </section>

      <section className="a-sec">
        <HowWeHelp c={c} />
      </section>

      <section className="a-sec a-end">
        <Cta c={c} prov={prov} />
      </section>
      <footer className="a-foot2"><Meta c={c} prov={prov} /></footer>
    </article>
  );
}

/* B. The ruler: one big visual answers "behind, on track or ahead?", and every strand is a meter. */
export function VariantB({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="rp-b">
      <section className={`b-hero is-${c.verdict}`}>
        <div className="b-hero-in">
          <p className="rp-k">{c.name}&apos;s math placement</p>
          <h1>
            Working at <em>{gradeName(c.level)}</em> level
          </h1>
          <p className="b-verdict"><span>{VERDICT_SHORT[c.verdict]}</span> {verdictSentence(c)}</p>
          <Scale c={c} />
        </div>
      </section>
      <div className="b-body">
        <div className="b-context">
          <FsaLine c={c} />
          <Comparison c={c} stage={stage} />
          {helped && <HelpWarning c={c} />}
        </div>

        <section className="b-sec">
          <h2>Four areas</h2>
          <div className="b-meters">
            {c.strands.map((s) => (
              <div className="b-meter" key={s.name}>
                <div className="b-meter-h">
                  <b>{s.name}</b>
                  <StatusChip s={s.status} />
                </div>
                <div className="b-bar" role="img" aria-label={`${s.correct} of ${s.total} right, ${STATUS_LABEL[s.status]}`}>
                  <span className="z1" /><span className="z2" /><span className="z3" />
                  <i style={{ left: `${pct(s.correct, s.total)}%` }} />
                </div>
                <div className="b-meter-f">
                  <Count correct={s.correct} total={s.total} />
                  <span>{s.note}</span>
                </div>
              </div>
            ))}
            <p className="b-legend"><i className="z1" />Needs attention <i className="z2" />Developing <i className="z3" />Secure</p>
          </div>
        </section>

        <section className="b-sec b-split">
          <div>
            <h2>Number facts</h2>
            <Facts c={c} layout="stack" />
          </div>
          <div>
            <h2>{c.name}&apos;s work</h2>
            <div className="b-work">
              {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
            </div>
          </div>
        </section>

        <section className="b-sec b-split b-end">
          <HowWeHelp c={c} />
          <Cta c={c} prov={prov} tone="field" />
        </section>
        <p className="b-meta"><Meta c={c} prov={prov} /></p>
      </div>
    </article>
  );
}

/* C. Dashboard: every part is a tile, all visible at once, like an account page. */
export function VariantC({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="rp-c">
      <header className="c-head">
        <div>
          <p className="rp-k">Math placement · {c.date}</p>
          <h1>{c.name}&apos;s report</h1>
        </div>
        <p className="c-meta"><Meta c={c} prov={prov} /></p>
      </header>
      {helped && <HelpWarning c={c} />}
      <div className="c-grid">
        <section className={`c-tile c-level is-${c.verdict}`}>
          <p className="rp-k">Working level</p>
          <b className="c-big">{c.level === 0 ? "K" : c.level}</b>
          <p>Grade {c.level === 0 ? "K" : c.level} level. {verdictSentence(c)}</p>
        </section>
        <section className="c-tile c-scale">
          <p className="rp-k">Against the grade scale</p>
          <Scale c={c} />
          <FsaLine c={c} />
          <Comparison c={c} stage={stage} />
        </section>
        {c.strands.map((s) => (
          <section className={`c-tile c-strand is-${s.status}`} key={s.name}>
            <p className="rp-k">{s.name}</p>
            <StatusChip s={s.status} />
            <Dots correct={s.correct} total={s.total} />
            <Count correct={s.correct} total={s.total} />
            <p className="c-note">{s.note}</p>
          </section>
        ))}
        <section className="c-tile c-facts">
          <p className="rp-k">Number facts</p>
          <Facts c={c} layout="stack" />
        </section>
        <section className="c-tile c-work">
          <p className="rp-k">{c.name}&apos;s work</p>
          <div className="c-work-row">
            {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
          </div>
        </section>
        <section className="c-tile c-help">
          <HowWeHelp c={c} />
        </section>
        <section className="c-tile c-cta">
          <Cta c={c} prov={prov} tone="field" />
        </section>
      </div>
    </article>
  );
}

/* D. Read it together: one idea per screen, in plain words, for a parent and child reading side by side. */
const GROUPS: { s: Status; title: (n: string) => string }[] = [
  { s: "secure", title: (n) => `What ${n} is sure of` },
  { s: "developing", title: () => "Getting there" },
  { s: "attention", title: () => "What to work on next" },
];

export function VariantD({ c, stage, prov, helped }: ReportProps) {
  const chapters = ["Where", "Areas", "Facts", "Work", "Next"];
  return (
    <article className="rp-d">
      <nav className="d-rail" aria-label="Report parts">
        {chapters.map((t, i) => (
          <a key={t} href={`#d${i}`}><i>{i + 1}</i>{t}</a>
        ))}
      </nav>
      <section className="d-ch d-first" id="d0">
        <p className="rp-k">{c.name}&apos;s math report · {c.date}</p>
        <h1>{levelSentence(c)}</h1>
        <p className="d-lead">{verdictSentence(c)} {c.verdict === "behind" ? `That is a starting point, not a grade. It shows where the books begin.` : c.verdict === "ahead" ? `${c.name} is ready for harder work.` : `${c.name} is right where ${c.they} should be.`}</p>
        <Scale c={c} />
        <FsaLine c={c} />
        <Comparison c={c} stage={stage} />
        {helped && <HelpWarning c={c} />}
      </section>

      <section className="d-ch" id="d1">
        <p className="d-num">2 of 5</p>
        <h2>Four areas of math</h2>
        <div className="d-groups">
          {GROUPS.map((g) => {
            const xs = c.strands.filter((s) => s.status === g.s);
            if (!xs.length) return null;
            return (
              <div key={g.s} className={`d-group is-${g.s}`}>
                <h3>{g.title(c.name)}</h3>
                {xs.map((s) => (
                  <div className="d-strand" key={s.name}>
                    <p><b>{s.name}</b> <StatusChip s={s.status} /></p>
                    <p>{s.note}</p>
                    <p className="d-count"><Dots correct={s.correct} total={s.total} /> <Count correct={s.correct} total={s.total} /></p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>

      <section className="d-ch" id="d2">
        <p className="d-num">3 of 5</p>
        <h2>Quick number facts</h2>
        <p className="d-lead">A short timed round, only with facts a grade {c.grade} child is expected to know. We look at how many were right and how quick they were, together.</p>
        <Facts c={c} />
      </section>

      <section className="d-ch" id="d3">
        <p className="d-num">4 of 5</p>
        <h2>{c.name}&apos;s own work</h2>
        <p className="d-lead">On some questions {c.name} showed the working on the whiteboard. Here it is, exactly as written.</p>
        <div className="d-work">
          {c.work.map((w) => <WorkCard key={w.question} w={w} />)}
        </div>
      </section>

      <section className="d-ch d-last" id="d4">
        <p className="d-num">5 of 5</p>
        <h2>{helpTitle(c)}</h2>
        <p className="d-lead">{helpText(c)}</p>
        <Cta c={c} prov={prov} tone="field" />
        <p className="d-meta"><Meta c={c} prov={prov} /></p>
      </section>
    </article>
  );
}

/* E. Show the work: a short headline, then each area beside the child's real work for that area. */
export function VariantE({ c, stage, prov, helped }: ReportProps) {
  return (
    <article className="rp-e">
      <header className="e-head">
        <div className="e-head-l">
          <p className="rp-k">{c.name} · math placement · {c.date}</p>
          <h1>{levelSentence(c)}</h1>
          <p>{verdictSentence(c)}</p>
        </div>
        <div className="e-head-r">
          <Scale c={c} />
          <Comparison c={c} stage={stage} compact />
        </div>
      </header>
      <FsaLine c={c} />
      {helped && <HelpWarning c={c} />}

      <section className="e-rows">
        <h2>Area by area, with {c.name}&apos;s work</h2>
        {c.strands.map((s) => {
          const ws = c.work.filter((w) => w.strand === s.name);
          return (
            <div className={`e-row is-${s.status}`} key={s.name}>
              <div className="e-row-l">
                <h3>{s.name}</h3>
                <p className="e-res"><StatusChip s={s.status} /> <Count correct={s.correct} total={s.total} /></p>
                <Dots correct={s.correct} total={s.total} />
                <p>{s.note}</p>
              </div>
              <div className="e-row-r">
                {ws.length ? (
                  ws.map((w) => (
                    <figure className="e-work" key={w.question}>
                      <figcaption>{w.question}</figcaption>
                      <WorkImage w={w} />
                      <p className={`rp-work-a ${w.correct ? "ok" : "no"}`}>{w.correct ? "✓ Correct" : "✗ Not correct"} · answer {w.answer}</p>
                      {w.comment && <p className="rp-work-c">{w.comment}</p>}
                    </figure>
                  ))
                ) : (
                  <p className="e-none">No shown-work question in this area on this test.</p>
                )}
              </div>
            </div>
          );
        })}
        <div className="e-row">
          <div className="e-row-l">
            <h3>Number facts</h3>
            <p>Timed round, facts for grade {c.grade} only.</p>
          </div>
          <div className="e-row-r"><Facts c={c} /></div>
        </div>
      </section>

      <section className="e-end">
        <HowWeHelp c={c} />
        <Cta c={c} prov={prov} tone="field" />
      </section>
      <p className="e-meta"><Meta c={c} prov={prov} /></p>
    </article>
  );
}

export const VARIANTS = [
  { key: "A", name: "Report card (r12)", C: VariantA },
  { key: "A2", name: "Wide document", C: VariantA2 },
  { key: "A3", name: "Report card + ruler", C: VariantA3 },
  { key: "A4", name: "Panels", C: VariantA4 },
  { key: "A5", name: "Summary beside detail", C: VariantA5 },
  { key: "B", name: "The ruler", C: VariantB },
  { key: "C", name: "Dashboard", C: VariantC },
  { key: "D", name: "Read it together", C: VariantD },
  { key: "E", name: "Show the work", C: VariantE },
] as const;
