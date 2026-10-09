// "How we're different": a comparison table placed before Pricing.
// Every competitor cell is backed by .design/research/competitors-2026-10.md; re-check it before editing.
// Desktop: a real 5-column table, our column on a grainy wash. Under 700px each row stacks into a card
// (explicit table roles keep the semantics when CSS changes the display; see compare.css).
import { Section, SectionHeader } from "@/ds";
import { BRAND, PLANS } from "@/lib/site";
import { Knot, Rise } from "./drawn";
import "@/ds/styles/compare.css";

const COLS = ["Learning centres", "Private tutor", "Online practice apps", BRAND];

const ROWS: [string, string, string, string, string][] = [
  ["The material", "A set program, often the same for every child", "Tailored by the tutor", "Practice on a screen", "Matched to your child's level and gaps"],
  ["Adapts to pace and gaps", "Moves at their own pace, on a set path", "Yes, the tutor adjusts each session", "Yes, on screen", "Every book adapts to how they did"],
  ["Seeing where they're stuck", "From the instructor, at the centre", "From the tutor, as they report it", "Reports on screen activity", "Gap report and solutions after every scan"],
  ["Works on paper", "Often", "Depends", "No, on a screen", "Yes, 15-20 minutes a day"],
  ["Cost", "About $200+ per subject / month", "About $40-$100 / hour", "Free to about $20 / month", `From CAD ${PLANS.one.price} / month, delivery included`],
];

export function Compare() {
  return (
    <Section id="compare" aria-labelledby="cmpT">
      <Knot />
      <Rise>
        <SectionHeader eyebrow="How we're different" title="Personal like a tutor. Structured like a learning centre. Priced like neither." titleId="cmpT" />
      </Rise>
      <Rise className="cmp" d={0.08}>
        <div className="cmp-in">
          <span className="cmp-wash" aria-hidden="true" />
          <table role="table" aria-labelledby="cmpT">
            <colgroup>
              <col className="c-lbl" />
              <col span={3} />
              <col className="c-us" />
            </colgroup>
            <thead role="rowgroup">
              <tr role="row">
                <td role="cell" />
                {COLS.map((c, i) => (
                  <th key={c} role="columnheader" scope="col" className={i === 3 ? "us" : undefined}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody role="rowgroup">
              {ROWS.map(([label, ...cells]) => (
                <tr key={label} role="row">
                  <th role="rowheader" scope="row">{label}</th>
                  {cells.map((v, i) => (
                    <td key={COLS[i]} role="cell" className={i === 3 ? "us" : undefined}>
                      <span className="cmp-who" aria-hidden="true">{COLS[i]}</span>
                      <span className="val">{v}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Rise>
    </Section>
  );
}
