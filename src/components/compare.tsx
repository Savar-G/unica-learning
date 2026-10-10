// "How we're different", folded into Pricing under the plan cards (D-076, variant B1 of round r10).
// Every competitor fact is backed by .design/research/competitors-2026-10.md; re-check it before editing.
// Categories only, never a competitor name (D-064). The category name is the heading; the trait is a chip under it.
import { BRAND, PLANS } from "@/lib/site";
import { Rise } from "./drawn";
import "@/ds/styles/compare.css";

const PANELS = [
  { name: BRAND, trait: "Personal and structured", price: `CAD ${PLANS.one.price}`, unit: "one subject, a month, delivery included", text: "Every book is matched to your child's level and gaps, and adapts to how they did. You get a gap report and solutions after every scan.", us: true },
  { name: "Private tutor", trait: "Personal", price: "$40-$100", unit: "an hour", text: "Tailored by the tutor, who adjusts each session. You hear about the gaps when the tutor reports them." },
  { name: "Learning centre", trait: "Structured", price: "$200+", unit: "per subject, a month", text: "A set program at the centre, often the same for every child. Your child moves at their own pace on a set path." },
];

export function ComparePanels() {
  return (
    <ul className="cmp" aria-label="How we compare">
      {PANELS.map((p, i) => (
        <Rise as="li" key={p.name} d={i * 0.08} className={p.us ? "us" : undefined}>
          <h3>{p.name}</h3>
          <p className="cmp-trait">{p.trait}</p>
          <p className="cmp-price"><b>{p.price}</b> <span>{p.unit}</span></p>
          <p className="cmp-txt">{p.text}</p>
        </Rise>
      ))}
    </ul>
  );
}
