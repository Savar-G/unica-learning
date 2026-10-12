"use client";

// PROTOTYPE ONLY, round r19 (branch site/compare-prototype-2). Throw away after Savar picks.
// Question: the "How we're different" cards under the plan card look like pricing tiers.
// What comparison reads as a comparison, and tells a parent in five seconds how we differ from a tutor and a learning centre?
// Five variants of the comparison inside Pricing, switchable via ?variant= (A is the live cards).
// Facts are the live ones from compare.tsx (backed by .design/research/competitors-2026-10.md). Categories only (D-064).
import type { ReactNode } from "react";
import { BRAND, PLANS } from "@/lib/site";
import { ComparePanels } from "./compare";
import { PrototypeSwitcher, useVariant } from "./prototype-switcher";
import "./compare-prototype.css";

const US = `CAD ${PLANS.one.price}`;
const TUTOR = { name: "Private tutor", trait: "Personal", price: "$40-$100", unit: "an hour" };
const CENTRE = { name: "Learning centre", trait: "Structured", price: "$200+", unit: "per subject, a month" };

const VARIANTS = [
  { key: "A", name: "Live cards" },
  { key: "B", name: "Venn: we sit in the middle" },
  { key: "C", name: "Check table" },
  { key: "D", name: "Like / unlike" },
  { key: "E", name: "Equation" },
];

export function ComparePrototype() {
  const [v, setV] = useVariant(VARIANTS.map((x) => x.key), "B", "#price");
  return (
    <>
      {v === "A" && <ComparePanels />}
      {v === "B" && <VariantVenn />}
      {v === "C" && <VariantTable />}
      {v === "D" && <VariantLikeUnlike />}
      {v === "E" && <VariantEquation />}
      <PrototypeSwitcher variants={VARIANTS} current={v} onChange={setV} />
    </>
  );
}

function Kicker({ children }: { children: ReactNode }) {
  return <p className="cp-kicker">{children}</p>;
}

/* B: two grey circles (tutor = personal, centre = structured); we are the coloured overlap. */
function VariantVenn() {
  return (
    <div className="cp cp-venn">
      <Kicker>How we compare</Kicker>
      <svg className="cp-venn-wide" viewBox="0 0 960 470" role="img" aria-label={`${TUTOR.name}: personal, ${TUTOR.price} ${TUTOR.unit}. ${CENTRE.name}: structured, ${CENTRE.price} ${CENTRE.unit}. ${BRAND}: personal and structured, ${US} a month.`}>
        <defs>
          <clipPath id="cpL"><circle cx="370" cy="235" r="225" /></clipPath>
          <linearGradient id="cpG" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--g1)" />
            <stop offset=".55" stopColor="var(--g2)" />
            <stop offset="1" stopColor="var(--g3)" />
          </linearGradient>
        </defs>
        <circle cx="370" cy="235" r="225" className="cp-c" />
        <circle cx="590" cy="235" r="225" className="cp-c" />
        <circle cx="590" cy="235" r="225" fill="url(#cpG)" clipPath="url(#cpL)" />
        <g textAnchor="middle">
          <text x="250" y="200" className="cp-n">{TUTOR.name}</text>
          <text x="250" y="232" className="cp-t">{TUTOR.trait}</text>
          <text x="250" y="290" className="cp-p">{TUTOR.price}</text>
          <text x="250" y="314" className="cp-u">{TUTOR.unit}</text>

          <text x="710" y="200" className="cp-n">{CENTRE.name}</text>
          <text x="710" y="232" className="cp-t">{CENTRE.trait}</text>
          <text x="710" y="290" className="cp-p">{CENTRE.price}</text>
          <text x="710" y="314" className="cp-u">{CENTRE.unit}</text>

          <text x="480" y="196" className="cp-n us">{BRAND}</text>
          <text x="480" y="228" className="cp-t us">Both</text>
          <text x="480" y="292" className="cp-p us">{US}</text>
          <text x="480" y="316" className="cp-u us">a month</text>
        </g>
      </svg>
      <svg className="cp-venn-tall" viewBox="0 0 360 620" role="img" aria-label={`${TUTOR.name}: personal. ${CENTRE.name}: structured. ${BRAND}: both, ${US} a month.`}>
        <defs>
          <clipPath id="cpT"><circle cx="180" cy="200" r="175" /></clipPath>
          <linearGradient id="cpG2" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--g1)" />
            <stop offset=".55" stopColor="var(--g2)" />
            <stop offset="1" stopColor="var(--g3)" />
          </linearGradient>
        </defs>
        <circle cx="180" cy="200" r="175" className="cp-c" />
        <circle cx="180" cy="420" r="175" className="cp-c" />
        <circle cx="180" cy="420" r="175" fill="url(#cpG2)" clipPath="url(#cpT)" />
        <g textAnchor="middle">
          <text x="180" y="88" className="cp-n">{TUTOR.name}</text>
          <text x="180" y="114" className="cp-t">{TUTOR.trait}</text>
          <text x="180" y="150" className="cp-u">{TUTOR.price} {TUTOR.unit}</text>

          <text x="180" y="282" className="cp-n us">{BRAND}</text>
          <text x="180" y="308" className="cp-t us">Both</text>
          <text x="180" y="350" className="cp-p us">{US}</text>
          <text x="180" y="372" className="cp-u us">a month</text>

          <text x="180" y="490" className="cp-n">{CENTRE.name}</text>
          <text x="180" y="516" className="cp-t">{CENTRE.trait}</text>
          <text x="180" y="552" className="cp-u">{CENTRE.price} {CENTRE.unit}</text>
        </g>
      </svg>
    </div>
  );
}

/* C: a real comparison table. Rows are the two traits plus cost; marks scan before words. */
type Mark = "yes" | "part";
const ROWS: { label: string; tutor: [Mark, string]; centre: [Mark, string]; us: [Mark, string] }[] = [
  { label: "Personal to your child", tutor: ["yes", "The tutor adjusts each session"], centre: ["part", "Own pace, on a set path"], us: ["yes", "Every book matched to their level and gaps"] },
  { label: "A structured plan", tutor: ["part", "Depends on the tutor"], centre: ["yes", "A set program at the centre"], us: ["yes", "A new book before the last one runs out"] },
  { label: "Gaps shown to you", tutor: ["part", "When the tutor reports them"], centre: ["part", "Depends on the centre"], us: ["yes", "A gap report after every scan"] },
];

function MarkIcon({ m }: { m: Mark }) {
  return <span className={`cp-mk ${m}`} aria-label={m === "yes" ? "Yes" : "Partly"} />;
}

function VariantTable() {
  return (
    <div className="cp cp-table">
      <Kicker>How we compare</Kicker>
      <div className="cp-tbl" role="table" aria-label="How we compare">
        <div className="cp-row cp-head" role="row">
          <span role="columnheader" />
          <span role="columnheader">{TUTOR.name}</span>
          <span role="columnheader">{CENTRE.name}</span>
          <span role="columnheader" className="us">{BRAND}</span>
        </div>
        {ROWS.map((r) => (
          <div className="cp-row" role="row" key={r.label}>
            <span role="rowheader">{r.label}</span>
            <span role="cell"><MarkIcon m={r.tutor[0]} />{r.tutor[1]}</span>
            <span role="cell"><MarkIcon m={r.centre[0]} />{r.centre[1]}</span>
            <span role="cell" className="us"><MarkIcon m={r.us[0]} />{r.us[1]}</span>
          </div>
        ))}
        <div className="cp-row cp-cost" role="row">
          <span role="rowheader">Cost</span>
          <span role="cell"><b>{TUTOR.price}</b> {TUTOR.unit}</span>
          <span role="cell"><b>{CENTRE.price}</b> {CENTRE.unit}</span>
          <span role="cell" className="us"><b>{US}</b> a month, delivery included</span>
        </div>
      </div>
      <p className="cp-legend"><MarkIcon m="yes" /> Yes <MarkIcon m="part" /> Partly</p>
    </div>
  );
}

/* D: one row per alternative, split into what we share with it and what we do differently. Mirrors the headline. */
function VariantLikeUnlike() {
  const rows = [
    { vs: TUTOR, like: ["Personal.", "Every book is matched to your child's level and gaps."], unlike: ["A monthly price, not an hourly one.", `${US} a month instead of ${TUTOR.price} ${TUTOR.unit}.`] },
    { vs: CENTRE, like: ["Structured.", "A clear plan, and the next book arrives before the last one runs out."], unlike: ["Built for your child, not a set path.", `${US} a month instead of ${CENTRE.price} per subject.`] },
  ];
  return (
    <div className="cp cp-lu">
      <Kicker>How we compare</Kicker>
      {rows.map((r) => (
        <div className="cp-lu-row" key={r.vs.name}>
          <h3><span>vs.</span> {r.vs.name}</h3>
          <div className="cp-lu-cell">
            <p className="cp-lu-tag same">Same</p>
            <p><b>{r.like[0]}</b> {r.like[1]}</p>
          </div>
          <div className="cp-lu-cell diff">
            <p className="cp-lu-tag">Different</p>
            <p><b>{r.unlike[0]}</b> {r.unlike[1]}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* E: a typographic sum. Tutor's trait plus centre's trait equals us, at a lower price than either. */
function VariantEquation() {
  return (
    <div className="cp cp-eq">
      <Kicker>How we compare</Kicker>
      <div className="cp-eq-line">
        <div className="cp-eq-term">
          <p className="cp-eq-t">{TUTOR.trait}</p>
          <p className="cp-eq-n">like a {TUTOR.name.toLowerCase()}</p>
          <p className="cp-eq-p">{TUTOR.price} {TUTOR.unit}</p>
        </div>
        <span className="cp-eq-op" aria-hidden>+</span>
        <div className="cp-eq-term">
          <p className="cp-eq-t">{CENTRE.trait}</p>
          <p className="cp-eq-n">like a {CENTRE.name.toLowerCase()}</p>
          <p className="cp-eq-p">{CENTRE.price} {CENTRE.unit}</p>
        </div>
        <span className="cp-eq-op" aria-hidden>=</span>
        <div className="cp-eq-term us">
          <p className="cp-eq-t">{BRAND}</p>
          <p className="cp-eq-n">personal and structured</p>
          <p className="cp-eq-p"><b>{US}</b> a month, delivery included</p>
        </div>
      </div>
    </div>
  );
}
