"use client";

// PROTOTYPE ONLY (branch site/price-compare-prototype): five ways to merge "How we're different" into Pricing.
// Question: can one section carry the plans and the tutor / learning centre comparison, so price is shown once?
// Switch with ?variant=now|A|B|C|D|E or the bottom bar (← →). "now" is the live page: Compare, then Pricing.
// Every variant uses the headline "Personal like a tutor. Structured like a learning centre. Priced like neither."
// Facts are the live Compare panel facts (.design/research/competitors-2026-10.md); categories only (D-064).
import { useEffect, useState } from "react";
import { Eyebrow, Highlight, Section, SectionHeader } from "@/ds";
import { BRAND, PLANS } from "@/lib/site";
import { Compare } from "./compare";
import { Knot } from "./drawn";
import { Pricing, PricingPlans } from "./sections";
import { PrototypeSwitcher, SHOW_PROTOTYPES } from "./prototype-switcher";
import "./price-compare-prototype.css";

const TITLE = "Personal like a tutor. Structured like a learning centre. Priced like neither.";
const P = PLANS.one.price;

const TUTOR = { who: "Private tutor", trait: "Personal.", price: "$40-$100", unit: "an hour", text: "Tailored by the tutor, who adjusts each session. You hear about the gaps when the tutor reports them." };
const CENTRE = { who: "Learning centre", trait: "Structured.", price: "$200+", unit: "per subject, a month", text: "A set program at the centre, often the same for every child. Your child moves at their own pace on a set path." };
const US = { who: BRAND, trait: "Personal and structured.", price: `CAD ${P}`, unit: "one subject, a month, delivery included", text: "Every book is matched to your child's level and gaps, and adapts to how they did. You get a gap report and solutions after every scan." };

function Guarantee() {
  return <p className="g-line">Every plan has a <Highlight>30-day money-back guarantee.</Highlight></p>;
}

function Shell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Section id="price" aria-labelledby="priceT" className={`pc ${className}`.trim()}>
      <Knot />
      <SectionHeader eyebrow="Pricing" title={TITLE} titleId="priceT" />
      <Guarantee />
      <PricingPlans />
      {children}
    </Section>
  );
}

/* A: three ruled rows under the cards. Tutor, centre, us: same columns, so the eye reads down the price column. */
function VariantA() {
  return (
    <Shell className="pc-a">
      <p className="pc-label">How it compares</p>
      <ul className="pc-a-rows">
        {[TUTOR, CENTRE, US].map((r) => (
          <li key={r.who} className={r === US ? "us" : undefined}>
            <p className="pc-who">{r.who}</p>
            <h3>{r.trait}</h3>
            <p className="pc-a-price"><b>{r.price}</b> <span>{r.unit}</span></p>
            <p className="pc-a-txt">{r.text}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/* B: one grey band under the cards. Our claim on the left in ink; the two alternatives in grey on the right. */
function VariantB() {
  return (
    <Shell className="pc-b">
      <div className="pc-b-band">
        <div className="pc-b-us">
          <p className="pc-who us">{BRAND}</p>
          <p className="pc-b-claim">Personal and structured, from <b>CAD {P}</b> a month.</p>
          <p className="pc-b-txt">{US.text}</p>
        </div>
        {[TUTOR, CENTRE].map((r) => (
          <div key={r.who} className="pc-b-alt">
            <p className="pc-who">{r.who}</p>
            <h3>{r.trait}</h3>
            <p className="pc-b-price"><b>{r.price}</b> <span>{r.unit}</span></p>
            <p className="pc-b-txt">{r.text}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* C: head to head. The parent picks what they would otherwise do; three rows, them against us. */
function VariantC() {
  const rows = {
    tutor: [TUTOR.price + " " + TUTOR.unit, "Tailored by the tutor, who adjusts each session.", "You hear about the gaps when the tutor reports them."],
    centre: [CENTRE.price + " " + CENTRE.unit, "A set program at the centre, often the same for every child.", "Your child moves at their own pace on a set path."],
    us: [`CAD ${P} a month, one subject, delivery included`, "Every book is matched to your child's level and gaps, and adapts to how they did.", "You get a gap report and solutions after every scan."],
  };
  const labels = ["Cost", "How it is made", "Along the way"];
  const [them, setThem] = useState<"tutor" | "centre">("tutor");
  return (
    <Shell className="pc-c">
      <div className="pc-c-head">
        <p className="pc-label">Instead of</p>
        <div className="pc-c-seg" role="tablist" aria-label="Compare with">
          {(["tutor", "centre"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={them === k} onClick={() => setThem(k)}>
              {k === "tutor" ? "A private tutor" : "A learning centre"}
            </button>
          ))}
        </div>
      </div>
      <div className="pc-c-table">
        <div className="pc-c-col them">
          <p className="pc-who">{them === "tutor" ? TUTOR.who : CENTRE.who}</p>
          {rows[them].map((t, i) => (
            <div key={i} className="pc-c-cell"><span>{labels[i]}</span><p>{t}</p></div>
          ))}
        </div>
        <div className="pc-c-col us">
          <p className="pc-who us">{BRAND}</p>
          {rows.us.map((t, i) => (
            <div key={i} className="pc-c-cell"><span>{labels[i]}</span><p>{t}</p></div>
          ))}
        </div>
      </div>
    </Shell>
  );
}

/* D: the headline is the comparison. Each clause carries its price in the margin; the cards follow with nothing under them. */
function VariantD() {
  const lines = [
    { line: "Personal like a tutor.", ...TUTOR },
    { line: "Structured like a learning centre.", ...CENTRE },
    { line: "Priced like neither.", ...US, unit: "one subject, a month" },
  ];
  return (
    <Section id="price" aria-labelledby="priceT" className="pc pc-d">
      <Knot />
      <div className="sec-head">
      <Eyebrow>Pricing</Eyebrow>
      <h2 id="priceT" className="pc-d-title">
        {lines.map((l, i) => (
          <span key={l.line} className={`pc-d-row${i === 2 ? " us" : ""}`}>
            <span className="pc-d-line">{l.line}</span>
            <span className="pc-d-note">
              <b>{l.price}</b>
              <em>{l.unit}</em>
              <small>{l.text}</small>
            </span>
          </span>
        ))}
      </h2>
      </div>
      <Guarantee />
      <PricingPlans />
    </Section>
  );
}

/* E: a small check matrix under the cards. Two traits and a price; only our row has both checks. */
function VariantE() {
  const rows = [
    { ...TUTOR, personal: true, structured: false, note: "Tailored each session" },
    { ...CENTRE, personal: false, structured: true, note: "A set program, often the same for every child" },
    { ...US, personal: true, structured: true, note: "Every book matched to your child, on a set path" },
  ];
  const mark = (on: boolean) => <span className={`pc-e-mark${on ? " on" : ""}`} aria-label={on ? "Yes" : "No"}>{on ? "✓" : "-"}</span>;
  return (
    <Shell className="pc-e">
      <table className="pc-e-table">
        <thead>
          <tr>
            <th scope="col"><span className="pc-label">How it compares</span></th>
            <th scope="col">Made for your child</th>
            <th scope="col">A set path, book after book</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.who} className={r.who === BRAND ? "us" : undefined}>
              <th scope="row"><b>{r.who}</b><small>{r.note}</small></th>
              <td>{mark(r.personal)}</td>
              <td>{mark(r.structured)}</td>
              <td><b>{r.price}</b> <small>{r.unit}</small></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

function Now() {
  return (
    <>
      <Compare />
      <Pricing />
    </>
  );
}

const VARIANTS = [
  { key: "now", name: "Live: two sections", C: Now },
  { key: "A", name: "Ruled rows", C: VariantA },
  { key: "B", name: "Grey band", C: VariantB },
  { key: "C", name: "Head to head", C: VariantC },
  { key: "D", name: "Annotated headline", C: VariantD },
  { key: "E", name: "Check matrix", C: VariantE },
];

function Switch() {
  const [key, setKey] = useState("now");

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("variant");
    if (k && VARIANTS.some((v) => v.key === k)) setKey(k); // eslint-disable-line react-hooks/set-state-in-effect -- read the URL once after hydration
  }, []);

  useEffect(() => {
    // the page's reveal observer only sees the first render; show swapped-in content at once
    document.querySelectorAll("#price .rise, #compare .rise").forEach((el) => el.classList.add("is-in"));
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

export function PriceComparePrototype() {
  return SHOW_PROTOTYPES ? <Switch /> : <Now />;
}
