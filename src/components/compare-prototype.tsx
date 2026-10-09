"use client";

// PROTOTYPE ONLY (branch site/compare-prototype): five ways to show "how we're different", on the real home page.
// Question: should the section be a comparison table at all? Switch with ?variant=now|A|B|C|D|E or the bottom bar (← →).
// Facts are the same in every variant and come from the live table (.design/research/competitors-2026-10.md).
// Assumption to check: B and E turn the tutor's hourly rate into a month at one hour a week ($160-$400).
import { useEffect, useState } from "react";
import { Highlight, Section, SectionHeader } from "@/ds";
import { BRAND, PLANS } from "@/lib/site";
import { Compare } from "./compare";
import { Knot } from "./drawn";
import { PrototypeSwitcher, SHOW_PROTOTYPES } from "./prototype-switcher";
import "./compare-prototype.css";

const EYEBROW = "How we're different";
const TITLE = "Personal like a tutor. Structured like a learning centre. Priced like neither.";
const P = PLANS.one.price;

function Shell({ children, className = "", title = TITLE, lead }: { children: React.ReactNode; className?: string; title?: React.ReactNode; lead?: string }) {
  return (
    <Section id="compare" aria-labelledby="cmpT" className={`cp ${className}`.trim()}>
      <Knot />
      <SectionHeader eyebrow={EYEBROW} title={title} lead={lead} titleId="cmpT" />
      {children}
    </Section>
  );
}

/* A: the headline, made into three panels. One price each, apps as a footnote. */
function VariantA() {
  const panels = [
    { who: "Private tutor", trait: "Personal.", price: "$40-$100", unit: "an hour", text: "Tailored by the tutor, who adjusts each session. You hear about the gaps when the tutor reports them." },
    { who: "Learning centre", trait: "Structured.", price: "$200+", unit: "per subject, a month", text: "A set program at the centre, often the same for every child. Your child moves at their own pace on a set path." },
    { who: BRAND, trait: "Personal and structured.", price: `CAD ${P}`, unit: "a month, delivery included", text: "Every book is matched to your child's level and gaps, and adapts to how they did. You get a gap report and solutions after every scan.", us: true },
  ];
  return (
    <Shell className="cp-a">
      <div className="cp-a-grid">
        {panels.map((p) => (
          <article key={p.who} className={p.us ? "us" : undefined}>
            <p className="cp-who">{p.who}</p>
            <h3>{p.trait}</h3>
            <p className="price"><b>{p.price}</b> <span>{p.unit}</span></p>
            <p className="txt">{p.text}</p>
          </article>
        ))}
      </div>
      <p className="cp-foot">Online practice apps cost from free to about $20 a month, but the practice happens on a screen.</p>
    </Shell>
  );
}

/* B: what a month costs, as range bars on one scale. The argument is the length of one bar. */
function VariantB() {
  const MAX = 400;
  const rows = [
    { who: "Private tutor", note: "About $40-$100 an hour, one hour a week", lo: 160, hi: 400, label: "$160-$400" },
    { who: "Learning centre", note: "Per subject, a set program", lo: 200, hi: MAX, open: true, label: "$200+" },
    { who: "Online practice apps", note: "On a screen", lo: 0, hi: 20, label: "$0-$20" },
    { who: BRAND, note: "On paper, made for your child, delivery included", lo: 0, hi: P, label: `CAD ${P}`, us: true },
  ];
  return (
    <Shell className="cp-b" lead="What one subject costs in a month.">
      <div className="cp-b-chart" role="list">
        {rows.map((r) => (
          <div key={r.who} role="listitem" className={`row${r.us ? " us" : ""}`}>
            <div className="lbl">
              <b>{r.who}</b>
              <span>{r.note}</span>
            </div>
            <div className="track" aria-hidden="true">
              <i className={r.open ? "open" : undefined} style={{ left: `${(r.lo / MAX) * 100}%`, width: `${Math.max(((r.hi - r.lo) / MAX) * 100, 1.2)}%` }} />
            </div>
            <div className="val">{r.label}</div>
          </div>
        ))}
        <div className="axis" aria-hidden="true">
          {[0, 100, 200, 300, 400].map((t) => <span key={t} style={{ left: `${(t / MAX) * 100}%` }}>${t}{t === MAX ? "+" : ""}</span>)}
        </div>
      </div>
    </Shell>
  );
}

/* C: no table. One sentence that does the comparison; small enough to sit under "Why choose". */
function VariantC() {
  return (
    <Section id="compare" aria-labelledby="cmpT" className="cp cp-c">
      <Knot />
      <p className="eyebrow">{EYEBROW}</p>
      <h2 id="cmpT">
        <span className="dim">A private tutor costs about </span>$40-$100 an hour<span className="dim">. A learning centre, about </span>$200+ per subject a month<span className="dim">. {BRAND} is </span>
        <Highlight>CAD {P} a month</Highlight>
        <span className="dim">, and every book is made for your child.</span>
      </h2>
      <ul className="cp-c-facts">
        <li>Personal like a tutor</li>
        <li>Structured like a learning centre</li>
        <li>Priced like neither</li>
      </ul>
    </Section>
  );
}

/* D: keep a table, but every cell is a verdict and two or three words. Our column is outlined top to bottom. */
type V = "y" | "p" | "n";
const D_COLS = ["Learning centres", "Private tutor", "Online practice apps", BRAND];
const D_ROWS: [string, [V, string][]][] = [
  ["Matched to your child", [["p", "A set program"], ["y", "Tailored"], ["p", "Screen practice"], ["y", "Level and gaps"]]],
  ["Adapts to pace and gaps", [["p", "Own pace, set path"], ["y", "Each session"], ["y", "On screen"], ["y", "Every book"]]],
  ["Shows you where they're stuck", [["p", "At the centre"], ["p", "If the tutor reports it"], ["p", "Screen activity"], ["y", "After every scan"]]],
  ["On paper", [["p", "Often"], ["p", "Depends"], ["n", "No"], ["y", "15-20 min a day"]]],
];
const D_COST = ["About $200+ / subject / month", "About $40-$100 / hour", "Free to about $20 / month", `CAD ${P} / month`];
const GLYPH: Record<V, string> = { y: "Yes", p: "Partly", n: "No" };

function VariantD() {
  return (
    <Shell className="cp-d">
      <div className="cp-d-wrap">
        <table>
          <thead>
            <tr>
              <td />
              {D_COLS.map((c, i) => <th key={c} scope="col" className={i === 3 ? "us" : undefined}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {D_ROWS.map(([label, cells]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {cells.map(([v, t], i) => (
                  <td key={D_COLS[i]} className={i === 3 ? "us" : undefined}>
                    <span className="cp-who">{D_COLS[i]}</span>
                    <span className={`g g-${v}`} role="img" aria-label={GLYPH[v]} />
                    <span className="t">{t}</span>
                  </td>
                ))}
              </tr>
            ))}
            <tr className="cost">
              <th scope="row">Cost</th>
              {D_COST.map((c, i) => (
                <td key={D_COLS[i]} className={i === 3 ? "us" : undefined}>
                  <span className="cp-who">{D_COLS[i]}</span>
                  <span className="t">{c}</span>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

/* E: a month, as receipts. Parents compare what they get for the money, line by line. */
function VariantE() {
  const receipts = [
    {
      who: "A month with a private tutor",
      lines: [["4 one-hour sessions", "$40-$100 each"], ["Material", "tailored by the tutor"], ["Where they're stuck", "as the tutor reports it"], ["Practice on paper", "depends"]],
      total: "$160-$400",
    },
    {
      who: `A month with ${BRAND}`,
      lines: [["1 workbook, made for your child", "included"], ["15-20 min a day, 5 days a week", "included"], ["Photo check-in partway through", "included"], ["Gap report and worked solutions", "included"], ["Delivery before the book runs out", "included"]],
      total: `CAD ${P}`,
      us: true,
    },
    {
      who: "A month at a learning centre",
      lines: [["One subject, a set program", "$200+"], ["Material", "often the same for every child"], ["Where they're stuck", "from the instructor, at the centre"]],
      total: "$200+",
    },
  ];
  return (
    <Shell className="cp-e" lead="One subject, one month. Here is what the money buys.">
      <div className="cp-e-row">
        {receipts.map((r) => (
          <div key={r.who} className={`rcpt-w${r.us ? " us" : ""}`}>
            <article className={`rcpt${r.us ? " us" : ""}`}>
              <h3>{r.who}</h3>
              <dl>
                {r.lines.map(([k, v]) => (
                  <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
                ))}
              </dl>
              <p className="tot"><span>Total</span><b>{r.total}</b></p>
            </article>
          </div>
        ))}
      </div>
    </Shell>
  );
}

const VARIANTS = [
  { key: "now", name: "Current table", C: Compare },
  { key: "A", name: "Three panels", C: VariantA },
  { key: "B", name: "Cost bars", C: VariantB },
  { key: "C", name: "One sentence", C: VariantC },
  { key: "D", name: "Verdict grid", C: VariantD },
  { key: "E", name: "Month receipts", C: VariantE },
];

function Switch() {
  const [key, setKey] = useState("now");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("variant");
    if (k && VARIANTS.some((v) => v.key === k)) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []);

  useEffect(() => {
    // the page's reveal observer only sees the first render; show swapped-in content at once
    document.querySelectorAll("#compare .rise").forEach((el) => el.classList.add("is-in"));
  }, [key]);

  const change = (k: string) => {
    setKey(k);
    const url = new URL(window.location.href);
    url.searchParams.set("variant", k);
    window.history.replaceState(null, "", url);
  };

  const V = (VARIANTS.find((v) => v.key === key) ?? VARIANTS[0]).C;
  return (
    <>
      <V />
      <PrototypeSwitcher variants={VARIANTS} current={key} onChange={change} />
    </>
  );
}

export function ComparePrototype() {
  return SHOW_PROTOTYPES ? <Switch /> : <Compare />;
}
