"use client";

// PROTOTYPE ONLY (branch site/price-compare-prototype): five ways to merge "How we're different" into Pricing.
// Question: can one section carry the plans and the tutor / learning centre comparison, so price is shown once?
// Round 10 (after Savar picked B): five takes on B. Round 9 A, C, D, E live in commit history.
// Switch with ?variant=now|B|B1|B2|B3|B4|B5 or the bottom bar (← →). "now" is the live page: Compare, then Pricing.
// Every variant uses the headline "Personal like a tutor. Structured like a learning centre. Priced like neither."
// Facts are the live Compare panel facts (.design/research/competitors-2026-10.md); categories only (D-064).
import { useEffect, useState, type ReactNode } from "react";
import { Highlight, Section, SectionHeader } from "@/ds";
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

/* ---------- Round 10: five takes on B. The category name ("Private tutor") is the heading; the trait is a small label. ---------- */

const ICON: Record<string, ReactNode> = {
  [TUTOR.who]: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></svg>,
  [CENTRE.who]: <svg viewBox="0 0 24 24"><path d="M3 21h18M5 21V9l7-5 7 5v12" /><path d="M9 21v-5h6v5M9 11h.01M15 11h.01" /></svg>,
  [BRAND]: <svg viewBox="0 0 24 24"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></svg>,
};

const PANELS = [
  { name: BRAND, trait: "Personal and structured", price: US.price, unit: US.unit, text: US.text, us: true },
  { name: TUTOR.who, trait: "Personal", price: TUTOR.price, unit: TUTOR.unit, text: TUTOR.text, us: false },
  { name: CENTRE.who, trait: "Structured", price: CENTRE.price, unit: CENTRE.unit, text: CENTRE.text, us: false },
];

function Panels({ kind, icons = false, checks = false }: { kind: string; icons?: boolean; checks?: boolean }) {
  return (
    <Shell className={`pb pb-${kind}`}>
      <ul className="pb-grid">
        {PANELS.map((p) => (
          <li key={p.name} className={p.us ? "us" : undefined}>
            {icons && <span className="pb-ic" aria-hidden="true">{ICON[p.name]}</span>}
            <h3 className="pb-name">{p.name}</h3>
            <p className="pb-trait">
              {checks
                ? p.trait.split(" and ").map((t) => <span key={t}>✓ {t[0].toUpperCase() + t.slice(1)}</span>)
                : p.trait}
            </p>
            <p className="pb-price"><b>{p.price}</b> <span>{p.unit}</span></p>
            <p className="pb-txt">{p.text}</p>
          </li>
        ))}
      </ul>
    </Shell>
  );
}

/* B1: three white cards with clear borders; trait as a chip. */
const VariantB1 = () => <Panels kind="b1" />;
/* B2: spec sheet. No boxes: a heavy top rule, column rules, ticks for each trait. */
const VariantB2 = () => <Panels kind="b2" checks />;
/* B3: colour-coded. Each option owns a colour bar and a light tint. */
const VariantB3 = () => <Panels kind="b3" />;
/* B4: icon headers. A person, a building, a book. */
const VariantB4 = () => <Panels kind="b4" icons />;
/* Round 11: B1 with four replacements for the dark outline on our card. */
const VariantB1a = () => <Panels kind="b1 pb-b1a" />;
const VariantB1b = () => <Panels kind="b1 pb-b1b" />;
const VariantB1c = () => <Panels kind="b1 pb-b1c" />;
const VariantB1d = () => <Panels kind="b1 pb-b1d" />;
/* B5: big names on white; our panel dark. */
const VariantB5 = () => <Panels kind="b5" />;

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
  { key: "B", name: "Grey band (round 9)", C: VariantB },
  { key: "B1", name: "Outlined cards (dark outline)", C: VariantB1 },
  { key: "B1a", name: "B1, colour wash", C: VariantB1a },
  { key: "B1b", name: "B1, colour bar on top", C: VariantB1b },
  { key: "B1c", name: "B1, raised with a shadow", C: VariantB1c },
  { key: "B1d", name: "B1, warm tint", C: VariantB1d },
  { key: "B2", name: "Spec sheet", C: VariantB2 },
  { key: "B3", name: "Colour-coded", C: VariantB3 },
  { key: "B4", name: "Icon headers", C: VariantB4 },
  { key: "B5", name: "Big names, dark us", C: VariantB5 },
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
