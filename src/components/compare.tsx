// "How we're different": the headline as three panels, placed before Pricing (D-067, variant A of round r7).
// Every competitor fact is backed by .design/research/competitors-2026-10.md; re-check it before editing.
// Categories only, never a competitor name (D-064). Our panel carries the featured plan's grainy wash (D-037).
import { Section, SectionHeader } from "@/ds";
import { BRAND, PLANS } from "@/lib/site";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/compare.css";

const PANELS = [
  { who: "Private tutor", trait: "Personal.", price: "$40-$100", unit: "an hour", text: "Tailored by the tutor, who adjusts each session. You hear about the gaps when the tutor reports them." },
  { who: "Learning centre", trait: "Structured.", price: "$200+", unit: "per subject, a month", text: "A set program at the centre, often the same for every child. Your child moves at their own pace on a set path." },
  { who: BRAND, trait: "Personal and structured.", price: `CAD ${PLANS.one.price}`, unit: "one subject, a month, delivery included", text: "Every book is matched to your child's level and gaps, and adapts to how they did. You get a gap report and solutions after every scan.", us: true },
];

export function Compare() {
  return (
    <Section id="compare" aria-labelledby="cmpT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How we're different" title="Personal like a tutor. Structured like a learning centre. Priced like neither." titleId="cmpT" />
      </Rise>
      <ul className="cmp">
        {PANELS.map((p, i) => (
          <Rise as="li" key={p.who} d={i * 0.08} className={p.us ? "us" : undefined}>
            <p className="cmp-who">{p.who}</p>
            <h3>{p.trait}</h3>
            <p className="cmp-price"><b>{p.price}</b> <span>{p.unit}</span></p>
            <p className="cmp-txt">{p.text}</p>
          </Rise>
        ))}
      </ul>
    </Section>
  );
}
